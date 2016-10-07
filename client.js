'use strict';

const net = require('net');
const dgram = require('dgram');
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

	function timeouter() {
		console.log('confirm PACKAGE send timeout');
		assert(0);
	}

	function confirm_send(type, no ,data, callback) {
		send_package(type, no, data);
		let timer = setTimeout(timeouter, TIMTOUT);
		emitter.once('ACK', () => {
			clearTimtout(timer);
			callback();
		});
	}

	function send_data(data) {

		//send_package(0x0, 0, String(data.length));
		confirm_send(0x0, 0, String(data.length), () => {

			let pos = 0, no = 1;
			for (; pos < data.length; pos += PACKLEN, no++) {
				let len = PACKLEN;
				if (pos + len > data.length)
					len = data.length - pos;

				send_package(0x0, no, data.substr(data, len));
			}
		});
	}

	let data = num1 + ' ' + num2;
	send_data(data);

	let ans = '';
	
	socket.on('message', (msg, rinfo) => {
		msg = Buffer.from(msg);
		// Check msg TYPE
		switch (msg[0]) {
			case 0x0: // NOR
				let no = msg.readInt32LE(1);
				let sz = msg.readInt16LE(5);

				assert(sz > 0);
				assert(msg.length === 1 + 4 + 2 + sz);

				ans += msg.toString('utf8', 7, sz);

				break;
			case 0x1: // RSD
				// We need to resend the package
				let no = msg.readInt32LE(1);
				console.log('resend no = ', no);
				send_package(0x0, no, '');

				break;
			case 0x2: // ACK
				emitter.emit('ACK');
				break;
			default:
				console.log('msg TYPE error');
				assert(0);
		}
	});

}
