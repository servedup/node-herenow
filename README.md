# Overview

The node herenow module provides a working example of how to utilise the Voxhub Herenow API.

The Herenow API is access using a Websocket. The **HerenowWebSocketClient** provides a basic implementation that you can use to make your own
node script to access the events API or simply use this as an example implementation to make your own.


## Getting Started ##

Create a new node project if you need to

```
mkdir example-project
cd example-project
npm init
```

Install the herenow module

```
npm install herenow
```



## HerenowWebSocketClient


Include the Websocket client.

```
var HerenowWebSocketClient = require('herenow').websocketClient;

```

Create a connection config. The apiKey will need to be set-up to access your account and the globalUsername for the key will be provided.

```
var connectionConfig = {
	herenowVersion: 1,
	consoleDebugging: false,
	websocketUrl: "wss://herenow.voxhub.net/herenow/events",
	apiKey: "XXXXX-XXXXX-XXXX-XXXX-YYYYYYYYYY",
	globalUsername: "username.phoneServiceName",
	onConnect: function() {
		console.log('WebSocket Client Connected');
	},
	onClose :  function() {
		console.log('WebSocket Closed');
		},
	onOperationalEvent: function(message) {
		console.log('Operational Message');
	},
	onHerenowEvent: function(message) {		
			console.log('EVENT '+message.utf8Data);			
	},
	onReconnectEvent: function(message) {
		console.log('RECONNECT '+message.utf8Data);
	}
}
```