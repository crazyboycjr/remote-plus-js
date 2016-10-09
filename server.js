'use strict';

const net = require('net');
const dgram = require('dgram');
const util = require('util');
const assert = require('assert');
const EventEmitter = require('events');
class MyEmitter extends EventEmitter {}

const HOST = '0.0.0.0';
const PORT = 12345;
const BACKLOG = 511; // Default value of node 
const TIMEOUT = 1000;

function start_tcp_server() {

	let server = net.createServer();
	server.listen({
		port: PORT,
		host: HOST,
		backlog: BACKLOG
	}, () => {
		console.log('TCP:', server.address());
	});

	server.on('connection', function(socket) {

		console.log('Connected: ', socket.remoteAddress + ':' + socket.remotePort);
		
		socket.setEncoding('utf8');
		socket.on('end', () => {
			console.log(`client ${socket.remoteAddress}:${socket.remotePort} disconnected`);
		});

		let data = '';
		socket.on('data', (chunk) => {
			data += chunk;
			if (data.endsWith('done\n') || data.endsWith('done')) {
				// 在TCP传输中我们规定以done结尾作为结束
				data = data.trim();
				if (data.endsWith('done'))
					data = data.substring(0, data.length - 4);
				data = data.trim();
				data = data.replace(/ +/g, ' ');

				let [num1, num2] = data.split(' ');
				console.log(num1, num2);

				let ans = add(num1, num2);
				console.log(ans);

				socket.write(ans);
				socket.end();
			}
		});

	});

	server.on('error', (err) => {
		console.log(err);
		setTimeout(() => {
			server.close();
			server.listen({
				port: PORT,
				host: HOST,
				backlog: BACKLOG
			}, TIMEOUT);
		});
	});
}

start_tcp_server();


function start_udp_server() {

	const TIMEOUT = 1000;
	const PACKLEN = 512;
	let emitter = new MyEmitter();

	let socket = dgram.createSocket('udp4');

	socket.bind(PORT);
	socket.on('listening', () => {
		let addr = socket.address();
		console.log('UDP:', socket.address());
	});

	socket.on('error', (err) => {
		console.log(err);
	});

	function resize(arr, nsz, dv) {
		while (nsz > arr.length)
			arr.push(dv);
		arr.length = nsz;
	}

	class User {
		constructor() {
			this.ans = '';
			this.ans_piece = new Array();
			this.total = 0;
			this.now = 0;
			this.polling_id = 0;
			this.send_buffer = new Map();
		}
	}

	let user_pool = new Map();
	/*
	let send_buffer = new Map();
	*/
	function send_package(type, no, data, rinfo) {

		let user_key = util.format('%s:%s', rinfo.address, rinfo.port);
		console.log('when send_pkg, user_key = ', user_key);
		let u = user_pool.get(user_key);

		let key = {first: (type << 4) | no, second: rinfo};
		if (!u.send_buffer.has(key)) {

			let buf = Buffer.alloc(7 + data.length);
			buf.writeUInt8(type);
			buf.writeUInt32LE(no, 1);
			buf.writeUInt16LE(data.length, 5);
			buf.write(data, 7);
			
			u.send_buffer.set(key, buf);
		}

		console.log('send content = ', u.send_buffer.get(key));
		console.log('send rinfo = ', rinfo);

		socket.send(u.send_buffer.get(key), rinfo.port, rinfo.address, (err) => {
			if (err) {
				console.log(err);
				socket.end();
			}
		});
	}



	function confirm_send(type, no ,data, rinfo, callback) {

		let user_key = util.format('%s:%s', rinfo.address, rinfo.port);

		send_package(type, no, data, rinfo);

		function timeouter() {
			console.log('confirm PACKAGE send timeout');
			assert(0);
		}

		let timer = setTimeout(timeouter, TIMEOUT);
		emitter.on('ACK' + user_key, () => {
			clearTimeout(timer);
			callback();
		});
	}

	// this function split whole data into chunks(PACKAGES) and send it async.
	function send_data(data, rinfo) {

		//send_package(0x0, 0, String(data.length), rinfo);
		console.log('send_data:', data, rinfo);
		confirm_send(0x0, 0, String(Math.ceil(data.length / PACKLEN)), rinfo, () => {

			console.log('data = %s, datalen = %d', data, data.length);

			let pos = 0, no = 1;
			for (; pos < data.length; pos += PACKLEN, no++) {
				let len = PACKLEN;
				if (pos + len > data.length)
					len = data.length - pos;

				send_package(0x0, no, data.substr(pos, len), rinfo);
			}
		});
	}

	/*
	let ans = '';
	let ans_piece = new Array();
	let total = 0, now = 0;
	let polling_id = 0;
	*/
	//
	function polling(rinfo) {
		console.log('polling msg:');
		let user_key = util.format('%s:%s', rinfo.address, rinfo.port);
		let u = user_pool.get(user_key);

		for (let i = 1; i < u.ans_piece.length; i++)
			if (u.ans_piece[i].length === 0)
				send_package(0x1, i, '', rinfo);
	}
	
	//let user_pool = new Map(); 先不考虑多个人同时搞server的情况 
	socket.on('message', (msg, rinfo) => {
		msg = Buffer.from(msg);
		console.log('\nReceived %d bytes from %s:%d',
			msg.length, rinfo.address, rinfo.port);

		console.log('receive msg = ', msg);

		let key = util.format('%s:%s', rinfo.address, rinfo.port);
		console.log('when recv msg, user_key = ', key);
		if (!user_pool.has(key)) {
			user_pool.set(key, new User);
		}
		// Here by javascript feature, we have got a reference to user_pool[key]
		// thus, when u's value is change, user_po0l[key] will change too.
		let u = user_pool.get(key);

		//socket.send(util.inspect(udpMap.get(key)), rinfo.port, rinfo.address);
		
		let no, sz;
		switch (msg[0]) {
			case 0x0:
				no = msg.readInt32LE(1);
				sz = msg.readInt16LE(5);

				console.log('recv: type = %d, no = %d, sz = %d, msg.length = %d', msg[0], no, sz, msg.length);

				if (sz + 7 !== msg.length) // re-send
					send_package(0x1, no, '', rinfo);
				else {
					if (no === 0) { // send ACK
						console.log('send ACK');
						send_package(0x2, 0, '', rinfo);

						u.total = Number(msg.toString('utf8', 7));
						
						console.log('PACKAGE 0 total = %d', u.total);

						resize(u.ans_piece, u.total + 1, '');
						u.polling_id = setInterval(() => { polling(rinfo); }, 100);
					} else {
						if (u.ans_piece[no].length === 0) {
							u.now++;
							u.ans_piece[no] = msg.toString('utf8', 7);
							if (u.now === u.total) {
								clearInterval(u.polling_id);
								for (let i = 1; i < u.ans_piece.length; i++)
									u.ans += u.ans_piece[i];
								console.log(u, rinfo);
								emitter.emit('done', u.ans, rinfo);
							}
						}
					}
				}
				break;
			case 0x1:
				no = msg.readInt32LE(1);
				console.log('re-send no = ', no);
				send_package(0x0, no, '', rinfo);
				break;
			case 0x2:
				console.log('receive ACK');
				emitter.emit('ACK' + key);
				break;
			case 0x3:
				console.log('receive FIN');
				send_package(0x3, 0, '', rinfo); // no need to confirm_send 因为对方如果没有接受到这个FIN，还会继续发FIN给我
				clear_user(rinfo); // clear the info recorded for the client
				break;
			default:
				console.log('msg TYPE error');
				assert(0);
		}

	});

	emitter.on('done', (text, rinfo) => {
		console.log('text =', text);
		let [num1, num2] = text.split(' ');
		console.log('num1 = %s, num2 = %s', num1, num2);
		let res = add(num1, num2);
		console.log('calculated res = %s', res);

		send_data(res, rinfo);
	});

	function clear_user(rinfo) {
		let key = util.format('%s:%s', rinfo.address, rinfo.port);
		user_pool.delete(key);
	}

}

start_udp_server();








// A simple BigInteger Plus
function add(a, b) {
	a = Array.from(a).reverse().map(Number);
	b = Array.from(b).reverse().map(Number);
	let n = a.length;
	let m = b.length;
	if (n < m) n = m;
	for (let i = 0; i < n; i++) {
		if (isNaN(a[i])) a[i] = 0;
		if (isNaN(b[i])) b[i] = 0;	
	}
	let c = new Array(n).fill(0);
	for (let i = 0; i < n; i++)
		c[i] = a[i] + b[i];
	for (let i = 0; i < n - 1; i++) {
		if (c[i] >= 10) {
			c[i + 1]++;
			c[i] -= 10;
		}
	}
	if (c[n - 1] >= 10) {
		c.push(1);
		c[n - 1] -= 10;
	}
	return c.reverse().join('');
}
