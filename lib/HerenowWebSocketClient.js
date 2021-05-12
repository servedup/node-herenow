/************************************************************************
 * MIT License
 * 
 * Copyright (c) 2019 ServedUp Ltd
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 ***********************************************************************/

/**
* This code is currently subject to complete change. It is good for use as a reference only.
*/



/**
 * This uses the websocket module.
 */
var WebSocketClient = require('websocket').client;

/**
 * This uses the xmlhttprequest module.
 */
var XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;


/**
 * This is for the UUID generation.
 */
var getRandomValues = require('get-random-values');

/**
 * Constructor for HerenowWebSocketClient.
 * @constructor
 * @param {clientConfig} Used to configure the client.
 */
function HerenowWebSocketClient(connectionConfig) {
	
	/**
	 * The defaults
	 */
	var defaults = {
		serviceDiscoveryUrl: "https://api.voxhub.net/api/serviceDiscoveryAppDefaults",
		consoleDebugging: false,
		herenowVersion : 1,
		autoMigrate: true,
		websocketUrl: undefined,
		apiKey: undefined,
		globalUsername: undefined,
		onConnect: function(connection) {},
		onFailedConnect: function(error) {},
		onClose :  function() {},
		onOperationalEvent: function(message) {},
		onHerenowEvent: function(message) {},
		onReconnectEvent: function(message) {}
	}
		
	
	/**
	 * The main config with defaults and provided config merged.
	 */
	this._config = Object.assign(defaults, connectionConfig);		
	
	/**
	 * Controls Console Debugging 
	 */
	this._consoleDebugging = connectionConfig.consoleDebugging;
	
	/**
	 * You can provide a websocketUrl or the client will use the serviceDiscovery lookup
	 */
	if (!this._config.websocketUrl) {
		this.logToConsole("No websocketUrl provided with clientConfig will lookup URL with serviceDiscovery");		
	}
	
	/**
	 * The URL that the websocket should be connected to.
	 * Initialised to the one provided by the connectionConfig	 
	 */	
	this._websocketUrl = this._config.websocketUrl;
	
	/**
	 * This has a value when the client is connected to help tracking 
	 */
	this._connectedWebsocketUrl = undefined;	
	
	/**
	 * We need an apikey to connect
	 */
	if (!this._config.apiKey) {
		throw "Herenow apiKey is missing from your clientConfig"
	}
		
	this._apiKey = this._config.apiKey;

	/**
	 * Convenience property for storing the globalUsername
	 * The subscribe methods take arguments of the globalUsername
	 */
	this._globalUsername = this._config.globalUsername;
	
	/**
	 * Called when the websocket connects.
	 * Exposes the internal websocket connect event callback
	 * @param {connection}	- The connection is passed as the first argument to this function 	 
	 */
	this._onConnect = this._config.onConnect;	
	
	/**
	 * Called when the websocket fails to connect.
	 * Exposes the internal websocket failed connection event callback
	 */
	this._onFailedConnect = this._config.onFailedConnect;	
	/**
	 * Called when the websocket closes.
	 * Exposes the internal websocket close event callback
	 */	
	this._onClose = this._config.onClose;

	/**
	 * Fired when the client receives and operational type message from Herenow
	 * @param {message}	- The raw message from the websocket is passed as the first argument to this function
	 */			
	this._onOperationalEvent = this._config.onOperationalEvent;

	/**
	 * Fired when the client receives and api or event type message from Herenow
	 * @param {message}	- The raw message from the websocket is passed as the first argument to this function
	 */	
	this._onHerenowEvent = this._config.onHerenowEvent;
	
	/**
	 * This event is called when the client has reconnected as part of a migration to a different endpoint
	 * This would need to 
	 * @param {newWebsocketUrl}	- The new url that this websocket is connected to
	 */	
	this._onMigrationReconnectEvent = this._config.onMigrationReconnectEvent;

	/**
	 * The herenowVersion will be used by the connection process to locate the 
	 * correct endpoint with the correct version of the Herenow Events API.	  
	 */	
	this._herenowVersion = this._config.herenowVersion;		


	/**
	 * The autoMigrate property is used to determine whether the client will
	 * autoMigrate or not when it receives an operational message instructing it to do so.
	 * At the time of writing this we do not have a live operational reason for ignoring migration requests.
	 * So leave this as true!	 	  
	 */	
	this._autoMigrate = this._config.autoMigrate; 

	/**
	 * Where we store the callbacks functions for messages here.
	 * addMessageListenerCallback and removeMessageListenerCallback should be used to add and remove respectively
	 */
	this._messageListenerCallbacks = [];

	/**
	 * The connected client from the websocket module
	 */	
	this._webSocketClient = undefined;
	
	/**
	 * The connection from the websocket module
	 */		
	this._webSocketConnection = undefined;
	
	/**
	 * This is set to true when the HerenowWebSocketClient is successfully logged in.
	 */	
	this._loggedIn = false;
	
	/**
	 * This is used for by the sendObject function to locate callbacks for async events.
	 */		
	this._uuidCallbackMap = {}
	
}


/**
 * define this to make it easier to control debugging.
 */
Object.defineProperty(HerenowWebSocketClient.prototype, "consoleDebugging", {
	get: function() { return this._consoleDebugging; },
	set: function(newConsoleDebugging) { 
		this._consoleDebugging = newConsoleDebugging;
	}
});

/**
 * If consoleDebugging is enabled this will log to the console.
 */
HerenowWebSocketClient.prototype.logToConsole = function(message) {
	if (this._consoleDebugging) {console.log(message);}
}

/**
 * Connect up to the 
 * @function connect
 * Will connect up to the Herenow events api
 * 
 */
HerenowWebSocketClient.prototype.connect = function(onLoginSuccess,onLoginFailure) {
	var me = this;
	this._webSocketClient = new WebSocketClient();
	
	this._webSocketClient.on('connectFailed', function(error) {
		me._onFailedConnect.apply(this, [error]); 
	    me.logToConsole('Connect Error: ' + error.toString());
	});
	
	this._webSocketClient.on('connect', function(connection) {
		me._onConnect.apply(this, [connection]); 
		me._webSocketConnection = connection;	    
	    connection.on('error', function(error) {
	        me.logToConsole("Connection Error: " + error.toString());
	    });
	    connection.on('close', function() {
	       me._connectedWebsocketUrl = undefined;
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
		        			me.logToConsole("Subscribe Success "+message.utf8Data);  								
						} else {
							me.logToConsole("Subscribe Fail "+message.utf8Data);
						}
					}					
				} else if (data.messageType == 'operational') {
					if (data.eventAction == 'migrationNotification') {
						me.logToConsole("Migrate Request");
						if (me._autoMigrate) {
							this.logToConsole("Auto Migrate");
							me.reconnect(data.connectionUrl);
						}
					}
					me._onOperationalEvent.apply(this, [message]);	
				} else if (data.messageType == 'herenowEvent') {
					me._onHerenowEvent.apply(this, [message]);			
				} else {
					if (data.outcome == '-1') {
						me.logToConsole("Error: "+message.utf8Data);
					} else {
						throw "Unknown Message: "+message.utf8Data;
					}				
				}       
	        }
	    });
		me.login();
	});
	
	/**
	 * The websocket address is provided, use this to connect
	 */
	if (this._websocketUrl) {
		this.logToConsole("Connecting with the given url "+this._websocketUrl);
		this._webSocketClient.connect(this._websocketUrl, null,null,null,null);	
	} else { //ServiceDiscoveryConnect
		this.logToConsole("Looking up the websocketUrl with serviceDiiscovery");
		
		function connectUp() {		  
		  var serviceDisco = JSON.parse(this.responseText);
		  var url;
			for (var i = 0; i < serviceDisco.allocatedResources.length ;  i++ ) {		
				if (serviceDisco.allocatedResources[i].serviceDiscoveryResource.resourceType == "herenowEvents") {
					url = "wss://"+serviceDisco.allocatedResources[i].serviceDiscoveryResource.resourceName
				}
			}	
			if (url) {
				me._websocketUrl = url;
				this.logToConsole("Connecting with the serviuceDiscovery url "+me._websocketUrl);
				me._webSocketClient.connect(me._websocketUrl, null,null,null,null);	
			} else {
				throw "OOps could not look up websocketUrl with serviceDiscovery ";
			}
		}		
		
		var httpRequest = new XMLHttpRequest();
		httpRequest.addEventListener("load", connectUp);
		httpRequest.open("GET", this._config.serviceDiscoveryUrl);
		httpRequest.send();
	}
	
}

/**
 * This will close the client connection to the currently connected Websocket.
 */
HerenowWebSocketClient.prototype.close = function() {
	if (this._webSocketConnection) {
		this.logToConsole("Calling close on the connection");
		this._webSocketConnection.close();
	}
}

/**
 * This will reconnect the client to a newWebsocketUrl
 * This function is called automatically if an operational migration message is received.
 * This will first close the client connection to the currently connected Websocket if it is currently open.
 */
HerenowWebSocketClient.prototype.reconnect = function(newWebsocketUrl) {
	if (this._connectedWebsocketUrl != newWebsocketUrl) {
		this.logToConsole("Reconnecting to "+newWebsocketUrl);
		if (this._webSocketConnection) {
			this._webSocketConnection.close();
		}		
		this._webSocketClient.connect(this._config._websocketUrl, null,null,null,null);
	}
	
}

/**
 * A function for generating a UUID for use in messages.
 * Feel free to use this to provide your own UUID for messages
 * Internally, this is called when no UUID has been supplied and is required.
 * @return {string} a random UUID
 */
HerenowWebSocketClient.prototype.makeUUID = function() {
  return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
    (c ^ getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
  )
}


/**
 * The login function. This is called automatically as part of the connection process.
 */
HerenowWebSocketClient.prototype.login = function() {
	var UUID = this.makeUUID();
	var loginRequest = '{"clientRequestUUID" :"'+ UUID+'", "apiKey" : "'+this._apiKey+'", "action" : "auth", "herenowVersion" : "'+this._herenowVersion+'"}';
	this.logToConsole('Sending Auth '+loginRequest);
	this._webSocketConnection.sendUTF(loginRequest);
}

/**
 * Convenience function to send a JSON object  to Herenow.
 * The messageCallback is called when a reply is received.
 */
HerenowWebSocketClient.prototype.sendObject = function(messageObject,messageCallback) {
	var clientRequestUUID = this.addUUID(messageObject);
	this._uuidCallbackMap[clientRequestUUID] = messageCallback;	
	this._webSocketConnection.sendUTF(JSON.stringify(messageObject));
	return clientRequestUUID;
}

/**
 * Convenience function that adds a clientRequestUUID to the JSON messageObject provided if
 * one doesn't already exist.
 */
HerenowWebSocketClient.prototype.addUUID = function(messageObject) {
	if (!messageObject.clientRequestUUID) {		
		messageObject.clientRequestUUID = this.makeUUID();
	}
	return messageObject.clientRequestUUID;
}

/**
 * Send a subscription message for Herenow Events.
 * Convenience method that may be expanded on in the future.
 */
HerenowWebSocketClient.prototype.doSubscription = function(subscriptionConfig,messageCallback) {
	return this.sendObject(subscriptionConfig,messageCallback);
}

/**
 * Send a Ping
 * To receive a pong message.
 You shouldn't need this to be running in a loop but it is useful for you to get a reply if you are testing
 */
 HerenowWebSocketClient.prototype.sendPing = function(messageCallback) {
	 	var pingMessage = {
                action: "ping"
        };
	
	return  this.sendObject(pingMessage,messageCallback);
}

/**
 * Run a command via a websocket.
 * 
 */
HerenowWebSocketClient.prototype.runCommand = function(commandConfig) {
	var callback = commandConfig.success;	
	/**
	 * Take only what we want to post
	 */
	var serverCommandConfig = {
		action: "command",
		commandGroup: commandConfig.commandGroup,	
		parameters : commandConfig.parameters
	}	
	
	return this.sendObject(serverCommandConfig,callback);
}


/**
 * Subscribe to Voxhub Call Events
 * 
 */
HerenowWebSocketClient.prototype.subscribeVoxhubCallEvents = function(globalUsername,messageCallback) {
	
	var subscribeCallEvents = {
		action: "subscribe",
		eventName: "VoxhubCallEvent"
	};		
		
	if (globalUsername) {
		subscribeCallEvents.filter = globalUsername;
	}	
		
	return this.doSubscription(subscribeCallEvents,messageCallback);	   
	
}

/**
 * Subscribe to Voxhub User Events
 * 
 */
HerenowWebSocketClient.prototype.subscribeVoxhubUserEvents = function(globalUsername,messageCallback) {
	
	 var subscribeUserEvents = {
		action: "subscribe",
		eventName: "VoxhubUserStatusEvent"
	};	
	
	if (globalUsername) {
		subscribeUserEvents.filter = globalUsername;
	}
	
	return this.doSubscription(subscribeUserEvents,messageCallback); 
	
}

/**
 * Subscribe to Voxhub Queue Events
 * 
 */
HerenowWebSocketClient.prototype.subscribeVoxhubQueueEvents = function(queueName,messageCallback) {

	var subscribeQueueEvents = {
		action: "subscribe",
		eventName: "VoxhubQueueEvent"
	};	
	
	if (queueName) {
		subscribeQueueEvents.filter = queueName;
	}
		
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
