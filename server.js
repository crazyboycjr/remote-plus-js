'use strict';
const net = require('net');
const dgram = require('dgram');
const util = require('util');
const assert = require('assert');

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

	let socket = dgram.createSocket('udp4');

	socket.bind(PORT);
	socket.on('listening', () => {
		let addr = socket.address();
		console.log('UDP:', socket.address());
	});

	socket.on('error', (err) => {
		console.log(err);
	});

	let send_buffer = new Map();
	function send_package(type, no, data) {

		if (!send_buffer.has(no)) {
			let msg_no = Buffer.from(no);
			let msg_len = Buffer.from(data.length);
			let msg_text = Buffer.from(data);

			assert(data !== '');
			send_buffer.set(no, [msg_no, msg_len, msg_text]);
		}

		socket.send(send_buffer.get(no), PORT, HOST, (err) => {
			console.log(err);
			socket.close();	
		});
	}

	let ans = '';
	//let user_pool = new Map(); 先不考虑多个人同时搞server的情况 
	socket.on('message', (msg, rinfo) => {
		msg = Buffer.from(msg);
		console.log('Received %d bytes from %s:%d\n',
			msg.length, rinfo.address, rinfo.port);

		let key = util.format('%s:%s', rinfo.address, rinfo.port);

		//socket.send(util.inspect(udpMap.get(key)), rinfo.port, rinfo.address);
		
		switch (msg[0]) {
			case 0x0:
				let no = msg.readInt32LE(1);
				let sz = msg.readInt16LE(5);
				if (sz + 7 !== msg.length) // re-send
					send_package(0x1, no, '');
				else {
					if (no === 0) { // send ACK
						send_package(0x2, 0, '');
					} else {
						ans = msg.toString('utf8', 7, sz);
					}
				}
				break;
			case 0x1:
				let no = msg.readInt32LE(1);
				console.log('resend no = ', no);
				send_package(0x0, no, '');
				break;
			case 0x2:
				break;
			default:
				console.log('msg TYPE error');
				assert(0);
		}

	});

}

start_udp_server();









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
