# remote-plus-js
programming assignment of distributed system, transfer two numbers and return the sum, with UDP fault-tolerant
# 项目代码简单说明

## 前言

我实现了PJ要求的所有功能，其中包含基本TCP和UDP传输的加法操作，不限长度的高精度加法，带容错UDP的传输（本代码的亮点所在），以及一个粗糙的GUI。

其中，高精度加法这个地方在项目要求中说的不太清楚，我的理解是实现数组加法或者说向量加法是个挺含糊的事情，所以应当理解为普通高精度加法。

关于UDP容错机制，我自己设计的一套协议，并且按照协议进行了实现，并在自己机器和美国VPS之间进行了测试，是本实验花费精力最大的地方。

GUI的实现使用了electron，它使用HTML系列前端技术构建桌面应用。不过做的时候才发现自己前端技能并没有点...

客户端服务端代码的实现一律使用了Node.js

## 文件说明

- proto.txt 这个文件是我设计协议说明，因为觉得RFC文档的写法很不错，就模仿了它的写法。
- client.js 这是客户端的代码实现
- server.js 这是服务端的代码实现
- package.json main.js index.html style.css jquery.js 这四个文件是和前端相关的代码

## 使用方法

首先在服务机上输入
```bash
node server.js
```
这会在服务端监听12345端口
接下来是客户端操作
先说GUI, 首先需要在机器上安装electron, 然后切换到项目所在目录，键入
```bash
electron .
```
然而我觉得前端的目的就是向用户隐去一切，让用户无法感知后端发生了什么，那么为了调试，我们应该使用命令行
如果是命令行方法，首先需要修改`client.js`源代码最后两行，和`client.js`的开头`HOST`,`PORT`两个变量
```javasscript
var HOST = 'localhost';
var PORT = '12345';
...
exports.tcp_send('123', '999');
exports.udp_send('321', '988');
```
手动键入我们需要传的两个数，之后保存退出，在命令行中输入
```bash
node client.js
```
就可以看到我打印的详细的调试信息。
对于UDP，我们还可以手动修改`PACKLEN`这个变量的值，将其改大或者改小，来观察调试信息发生的变化，以了解整个传输过程。

## UDP容错设计思路
不过考虑到读者并不会看源代码定理以及并不会看调试信息定理，所以我还是在这里说一下设计过程。

tcp传输过程其实没什么特别要说的，源代码也就寥寥几行，简单易懂，在本项目里GUI的设计并没有任何出彩地方，所以也没什么好看的，高精度加法在`server.js`最后可以找到也是一目了然。

唯一在UDP容错机制我代码却实现较为复杂。
首先说一说设计思路。要考虑容错，就得知道UDP发送会产生什么错，根据资料得知
- udp在内网中几乎不会丢包 => 测试需要一个外网环境
- 当单个包长度过长时，容易发生丢包 => 单个包长度不能超过一定长度
- 单个包发过去内容还会有所丢失，这点不知道是否属实，不过为了以防万一，我还是做了判断
- 服务端接受到的包是乱序接收的

于是，我得手动把发送内容分包，单个包长度不能过长。
接下来就考虑如何把这些包都发过去，一个最简单的方法，就是每次发送一个UDP包，直到客户端接受对方返回一个ACK包之后，才发下一个包。当然如果我发送下一个包时，有可能之前包的ACK到达，为了不引发混乱，我还得记录这个包的编号。于是当记录下每个包的编号，和采用同步发送之后，这个问题就得到了解决。
不过这个方法是同步的，太慢了。我们最好能一次发送所有信息，哪些包中途丢了让对方告诉我才好。

我的方法正是基于这样的思路。
概括来说，客户端的第0个包包含了这次要发送的整体信息（一共有多少包要发送），这个包希望服务端一定要收到并作反馈，否则整个连接过程直接失败。
之后服务端每隔一个短时间会扫描自己有哪些包还没收到，并向客户端发送一个RSD信息告诉对方重新发一下这个包。
之后服务端整理发现自己已经拿到了所有包，于是计算加法并返回结果，返回结果时，整个过程和当初客户端向服务端发送是类似的，只是客户端和服务端的地位倒置了一下。
最后为了服务端以后还能继续发送别的请求，客户端和服务端需要相互发送一个FIN包，断开连接。此后服务端清空该客户的cache。

具体的协议参考`proto.txt`

## 总结

由于javascript天生异步的特性，实现时还带来了一些麻烦，不过所幸最终都解决了。

在实际测试时，如果服务端开在localhost，则发现完全不会丢包，所以把server放到了美国，并走IPv4，把每次PACKLEN改小，就可以观察到其中有许多次要求对方重发的过程。

如果老师对我UDP容错的实现还有疑问，或者感兴趣，或者又不想看我上面一大段话，欢迎与我联系和讨论。