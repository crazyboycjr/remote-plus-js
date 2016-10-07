'use strict';
const net = require('net');

const HOST = '0.0.0.0';
const PORT = 12345;
const BACKLOG = 511; // Default value of system

var server = net.createServer();
server.listen({
	port: PORT,
	host: HOST,
	backlog: BACKLOG
}, () => { console.log(server.address()); });

server.on('connection', function(socket) {

	console.log('Connected: ', socket.remoteAddress + ':' + socket.remotePort);

	socket.on('end', () => { console.log(`client ${socket.remoteAddress}:${socket.remotePort} disconnected`); });
	
	let data = '';
	socket.on('data', (chunk) => {
		data += chunk;
		if (data.endsWith('done\n') || data.endsWith('done')) {
			// 这里以done结尾作为结束
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
})


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
