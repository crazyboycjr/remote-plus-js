'use strict';

const net = require('net');

var HOST = '127.0.0.1';
var PORT = '12345';

var socket = net.connect({
	port: PORT,
	host: HOST
}, () => {
	console.log('Connected to server!');
});

socket.on('connect', () => {
	socket.write('123  456done\n');
});

socket.on('data', (data) => {
	console.log(data.toString());
	socket.end();
});

socket.on('end', () => {
	console.log('disconnect from server');
});
