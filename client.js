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

	function resize(arr, nsz, dv) {
		while (nsz > arr.length)
			arr.push(dv);
		arr.length = nsz;
	}

	let send_buffer = new Map();
	function send_package(type, no, data, rinfo) {

		let key = (type << 4) | no;
		if (!send_buffer.has(key)) {

			let buf = Buffer.alloc(7 + data.length);
			buf.writeUInt8(type);
			buf.writeUInt32LE(no, 1);
			buf.writeUInt16LE(data.length, 5);
			buf.write(data, 7);

			send_buffer.set(key, buf);
		}

		socket.send(send_buffer.get(key), rinfo.port, rinfo.address, (err) => {
			if (err) {
				console.log(err);
				socket.close();
			}
		});
	}

	function timeouter() {
		console.log('confirm PACKAGE send timeout');
		assert(0);
	}

	function confirm_send(type, no ,data, rinfo, callback) {
		send_package(type, no, data, rinfo);
		let timer = setTimeout(timeouter, TIMEOUT);
		emitter.once('ACK', () => {
			clearTimeout(timer);
			callback();
		});
	}

	function send_data(data, rinfo) {

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

	let ans = '';
	let ans_piece = new Array();
	let total = 0, now = 0;
	let polling_id = 0;
	//
	function polling(rinfo) {
		for (let i = 0; i < ans_piece.length; i++)
			if (ans_piece[i].length === 0)
				send_package(0x1, i, '', rinfo);
	}	

	socket.on('message', (msg, rinfo) => {
		msg = Buffer.from(msg);
		console.log('\nReceived %d bytes from %s:%d',
			msg.length, rinfo.address, rinfo.port);
		console.log('receive msg = ', msg);
		
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
						
						total = Number(msg.toString('utf8', 7));
						resize(ans_piece, total + 1, '');

						polling_id = setInterval(() => { polling(rinfo); }, 100);

					} else {
						if (ans_piece[no].length === 0)
							now++;
						ans_piece[no] = msg.toString('utf8', 7);
						if (now === total) {
							clearInterval(polling_id);
							for (let i = 1; i < ans_piece.length; i++)
								ans += ans_piece[i];
							emitter.emit('done', ans, rinfo);
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
			default:
				console.log('msg TYPE error');
				assert(0);
		}
	});

	emitter.once('done', (ans, rinfo) => {
		console.log('The returned ans = ', ans);
		socket.close();
	});

}

//tcp_send('123', '456');
udp_send('123', '45699');
