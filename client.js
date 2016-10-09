'use strict';

const net = require('net');
const dgram = require('dgram');
const util = require('util');
const assert = require('assert');
const EventEmitter = require('events');
class MyEmitter extends EventEmitter {}

var HOST = '127.0.0.1';
var PORT = '12345';
const TIMEOUT = 1000;

// num1 and num2 should be String type
function tcp_send(num1, num2) {
	num1 = String(num1);
	num2 = String(num2);

	let socket = net.connect({
		port: PORT,
		host: HOST
	}, () => {
		console.log('Connected to server!');
	});

	socket.setEncoding('utf8');

	socket.on('connect', () => {
		socket.write(num1);
		socket.write(' ');
		socket.write(num2);
		socket.write('done\n');
	});

	socket.on('data', (data) => {
		console.log(data.toString());
		socket.end();
	});

	socket.on('end', () => {
		console.log('disconnect from server');
	});

	socket.setTimeout(TIMEOUT, () => {
		console.log('%sms timeout', TIMEOUT);
		socket.close();
	});

}

// num1 and num2 should be String type
function udp_send(num1, num2) {
	num1 = String(num1);
	num2 = String(num2);

	const PACKLEN = 512;
	let emitter = new MyEmitter();

	let socket = dgram.createSocket('udp4');
	socket.on('error', (err) => {
		console.log(err);
		socket.close();
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

		socket.send(u.send_buffer.get(key), rinfo.port, rinfo.address, (err) => {
			if (err) {
				console.log(err);
				socket.close();
			}
		});
	}



	function confirm_send(type, no ,data, rinfo, callback) {

		send_package(type, no, data, rinfo);

		function timeouter() {
			console.log('confirm PACKAGE send timeout');
			assert(0);
		}		let timer = setTimeout(timeouter, TIMEOUT);

		emitter.on('ACK', () => {
			clearTimeout(timer);
			callback();
		});
	}

	function send_data(data, rinfo) {

		let key = util.format('%s:%s', rinfo.address, rinfo.port);
		if (!user_pool.has(key)) {
			user_pool.set(key, new User);
		}
		
		//send_package(0x0, 0, String(data.length), rinfo);
		confirm_send(0x0, 0, String(Math.ceil(data.length / PACKLEN)), rinfo, () => {

			let pos = 0, no = 1;
			for (; pos < data.length; pos += PACKLEN, no++) {
				let len = PACKLEN;
				if (pos + len > data.length)
					len = data.length - pos;

				send_package(0x0, no, data.substr(pos, len), rinfo);
			}
		});
	}

	let data = num1 + ' ' + num2;
	let rinfo = {port: PORT, address: HOST};
	send_data(data, rinfo);

	/*
	let ans = '';
	let ans_piece = new Array();
	let total = 0, now = 0;
	let polling_id = 0;
	*/
	//
	function polling(rinfo) {
		let user_key = util.format('%s:%s', rinfo.address, rinfo.port);
		let u = user_pool.get(user_key);

		for (let i = 0; i < u.ans_piece.length; i++)
			if (u.ans_piece[i].length === 0)
				send_package(0x1, i, '', rinfo);
	}

	socket.on('message', (msg, rinfo) => {
		msg = Buffer.from(msg);
		console.log('\nReceived %d bytes from %s:%d',
			msg.length, rinfo.address, rinfo.port);
		console.log('receive msg = ', msg);
		
		let key = util.format('%s:%s', rinfo.address, rinfo.port);
		if (!user_pool.has(key)) {
			user_pool.set(key, new User);
		}
		// Here by javascript feature, we have got a reference to user_pool[key]
		// thus, when u's value is change, user_pool[key] will change too.
		let u = user_pool.get(key);

		// Check msg TYPE
		let no, sz;
		switch (msg[0]) {
			case 0x0: // NOR
				no = msg.readInt32LE(1);
				sz = msg.readInt16LE(5);
				if (sz + 7 !== msg.length) // re-send
					send_package(0x1, no, '', rinfo);
				else {
					if (no === 0) { // send ACK
						console.log('send ACK');
						send_package(0x2, 0, '', rinfo);
						
						u.total = Number(msg.toString('utf8', 7));
						resize(u.ans_piece, u.total + 1, '');

						u.polling_id = setInterval(() => { polling(rinfo); }, 100);

					} else {
						if (u.ans_piece[no].length === 0)
							u.now++;
						u.ans_piece[no] = msg.toString('utf8', 7);
						if (u.now === u.total) {
							clearInterval(u.polling_id);
							for (let i = 1; i < u.ans_piece.length; i++)
								u.ans += u.ans_piece[i];
							emitter.emit('done', u.ans, rinfo);
						}
					}
				}	
				break;
			case 0x1: // RSD
				// We need to resend the package
				no = msg.readInt32LE(1);
				console.log('resend no = ', no);
				send_package(0x0, no, '', rinfo);

				break;
			case 0x2: // ACK
				console.log('receive ACK');
				emitter.emit('ACK');
				break;
			case 0x3:
				console.log('receive FIN');
				console.log('Connection finish.');
				emitter.emit('FIN');
				break;
			default:
				console.log('msg TYPE error');
				assert(0);
		}
	});

	emitter.on('done', (ans, rinfo) => {
		console.log('The returned ans = ', ans);

		function timeouter() {
			console.log('wait for FIN PACKAGE timeout');
			send_package(0x3, 0, '', rinfo); // re-send FIN PACKAGE if fail to recv FIN
		}
		let timer = setInterval(timeouter, TIMEOUT);
		emitter.on('FIN', () => {
			clearInterval(timer);
			
			let user_key = util.format('%s:%s', rinfo.address, rinfo.port);
			user_pool.delete(user_key);

			socket.close();
		});
	});

}

//tcp_send('123', '456');
udp_send('111111239999', '9999999999999999999945690009');
