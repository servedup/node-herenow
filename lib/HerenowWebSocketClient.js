

var WebSocketClient = require('websocket').client;

var getRandomValues = require('get-random-values');

function HerenowWebSocketClient(connectionConfig) {
	this._websocketUrl = connectionConfig.websocketUrl;
	this._apiKey = connectionConfig.apiKey;
	this._globalUsername = connectionConfig.globalUsername;
	this._onConnect = connectionConfig.onConnect;
	if (!this._onConnect) {
		this._onConnect = function() {};
	}
	this._onClose = connectionConfig.onClose;
	if (!this._onClose) {
		this._onClose = function() {};
	}
	this._onOperationalEvent = connectionConfig.onOperationalEvent;
	if (!this._onOperationalEvent) {
		this._onOperationalEvent = function() {};
	}
	this._onHerenowEvent = connectionConfig.onHerenowEvent;
	if (!this._onHerenowEvent) {
		this._onHerenowEvent = function() {};
	}
	this._herenowVersion = "1";		
	this._messageListenerCallbacks = [];
	this._webSocketClient = undefined;		
	this._webSocketConnection = undefined;
	this._loggedIn = false;
	
	this._uuidCallbackMap = {}
	
}

HerenowWebSocketClient.prototype.connect = function(onLoginSuccess,onLoginFailure) {
	var me = this;
	this._webSocketClient = new WebSocketClient();
	
	this._webSocketClient.on('connectFailed', function(error) {
	    console.log('Connect Error: ' + error.toString());
	});
	
	this._webSocketClient.on('connect', function(connection) {
		me._onConnect.apply(this, [connection]); 
		me._webSocketConnection = connection;	    
	    connection.on('error', function(error) {
	        console.log("Connection Error: " + error.toString());
	    });
	    connection.on('close', function() {
	       me._onClose.apply(this, []);
	    });
	    connection.on('message', function(message) {	    	
	    	me.fireMessageListenerCallbacks(message);
	        if (message.type === 'utf8') {        	        	
	        	var data = JSON.parse(message.utf8Data);	  
	        	var clientRequestUUID = data.clientRequestUUID;
	        	if (clientRequestUUID) {
		        	if (me._uuidCallbackMap[clientRequestUUID] != null) {
						me._uuidCallbackMap[clientRequestUUID].apply(this, [message]);
						delete me._uuidCallbackMap[clientRequestUUID];
					}
				}	
	        	if (data.messageType == 'api') {	        		
	        		if (data.action == 'auth') {        	
	        			if (data.outcome == '1') { 		        		
		        			this._loggedIn = true;							
							if (onLoginSuccess) {
								onLoginSuccess.apply(this, [data]);
							}
						} else {
							if (onLoginFailure) {
								onLoginFailure.apply(this, [data]);
							}
						}
					} else if (data.action == 'subscribe') {        	
	        			if (data.outcome == '1') { 		        		
		        			//console.log("Subscribe Success "+message.utf8Data);  								
						} else {
							//console.log("Subscribe Fail "+message.utf8Data);
						}
					}
					
				} else if (data.messageType == 'operational') {
					me._onOperationalEvent.apply(this, [message]);				
				} else {
					me._onHerenowEvent.apply(this, [message]);					
				}       
	        }
	    });
		me.login();
	});
	
	this._webSocketClient.connect(this._websocketUrl, null,null,null,null);	
}

HerenowWebSocketClient.prototype.makeUUID = function() {
  return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
    (c ^ getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
  )
}

HerenowWebSocketClient.prototype.login = function() {
	var UUID = this.makeUUID();
	var loginRequest = '{"clientRequestUUID" :"'+ UUID+'", "apiKey" : "'+this._apiKey+'", "action" : "auth", "herenowVersion" : "'+this._herenowVersion+'"}';
	console.log('Sending Auth');
	this._webSocketConnection.sendUTF(loginRequest);
}


HerenowWebSocketClient.prototype.sendObject = function(messageObject,messageCallback) {
	var clientRequestUUID = this.addUUID(messageObject);
	this._uuidCallbackMap[clientRequestUUID] = messageCallback;	
	this._webSocketConnection.sendUTF(JSON.stringify(messageObject));
	return clientRequestUUID;
}


HerenowWebSocketClient.prototype.sendMessage = function(message) {	
	this._webSocketConnection.sendUTF(message);
}

HerenowWebSocketClient.prototype.addUUID = function(messageObject) {
	if (!messageObject.clientRequestUUID) {		
		messageObject.clientRequestUUID = this.makeUUID();
	}
	return messageObject.clientRequestUUID;
}

HerenowWebSocketClient.prototype.doSubscription = function(subscriptionConfig,messageCallback) {
	return this.sendObject(subscriptionConfig,messageCallback);
}


HerenowWebSocketClient.prototype.runCommand = function(commandConfig,messageCallback) {	
	return this.sendObject(commandConfig,messageCallback);
}



HerenowWebSocketClient.prototype.subscribeVoxhubCallEvents = function(globalUsername,messageCallback) {
	
	var subscribeCallEvents = {
		action: "subscribe",
		eventName: "VoxhubCallEvent",
		filter: globalUsername
	};		
		
	return this.doSubscription(subscribeCallEvents,messageCallback);	   
	
}

HerenowWebSocketClient.prototype.subscribeVoxhubUserEvents = function(globalUsername,messageCallback) {
	
	 var subscribeUserEvents = {
		action: "subscribe",
		eventName: "VoxhubUserStatusEvent",
		filter: globalUsername
	};	
	
	return this.doSubscription(subscribeUserEvents,messageCallback); 
	
}


HerenowWebSocketClient.prototype.subscribeVoxhubQueueEvents = function(queueName) {

	var subscribeQueueEvents = {
		action: "subscribe",
		eventName: "VoxhubQueueEvent",
		filter: queueName
	};	
		
	return this.doSubscription(subscribeQueueEvents,messageCallback);
	
}


HerenowWebSocketClient.prototype.addMessageListenerCallback = function(callback) {
	if (callback) {
		// call remove first so not to register a callback more than once
		this.removeMessageListenerCallback(callback);
		this._messageListenerCallbacks.push(callback);
	}
}

HerenowWebSocketClient.prototype.removeMessageListenerCallback = function(callback) {
	for (var i = 0; i < this._messageListenerCallbacks.length; i++) {
		if (this._messageListenerCallbacks[i] === callback) {
			this._messageListenerCallbacks.splice(i, 1);
			return true;
		}
	}
	return false;
}


HerenowWebSocketClient.prototype.fireMessageListenerCallbacks = function(message) {	
	for (var i = 0; i < this._messageListenerCallbacks.length; i++) {
		this._messageListenerCallbacks[i].apply(this, [message]);
	}
}

module.exports = HerenowWebSocketClient;