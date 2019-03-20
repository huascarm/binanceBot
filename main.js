
var net = require('net');
var Robot = require('./robot.js');
var fs = require('fs');
var clientSocket;
const TEST = true;
API = ""
SECRET = ""


var binance = binance = require('node-binance-api')().options({
	APIKEY: 'mXpvqhYpSRGhcntQ7JFallsD6BpEvHANQyv5urcIyJou1UZ1w7IvebpiDUrnFPTU',
	APISECRET: 'mnlOHUNVlNjyfFGSL1EOdSoqyEbELLFtgpXHKBy3fXiyJOb8UOUng5hAQ3pWzsBL',
	recvWindow: 60000,
	useServerTime: true, // If you get timestamp errors, synchronize to server time at startup
	test: TEST // If you want to use sandbox mode where orders are simulated
});

fs.readFile('API', function read(err, data) {

	var msg ;
	if (err) {
		console.log('Don`t exist API charged');
	}
	else {
		msg = JSON.parse(data);
		const Binance = require('node-binance-api');
		var newInstance = null;
		try {
			newInstance = new Binance().options({
				APIKEY: msg.APIKEY,
				APISECRET: msg.APISECRET,
				recvWindow: 60000,
				useServerTime: true, // If you get timestamp errors, synchronize to server time at startup
				test: TEST // If you want to use sandbox mode where orders are simulated
			});

		} catch (error) {
			if (error) {
				var obj = {
					'protocol': 4,
					'information': 'API/SECRET invalid!'
				};
				socket.write(JSON.stringify(obj));
			}
			newInstance = null;
		}
		binance = newInstance;
	}
});


// instance of robot
var robots = {};
var timeCrossed = new Date();
global.ticker = {};

// program data
var listSymbols = [];
var symbolInfo = [];
var symbolSeries = [];
var symbolSeriesCanCheck = [];
var extractExchangeInfoDone = false;
var log = false;


function extractExchangeInfo() {
	binance.exchangeInfo(function (error, data) {
		if (error) {
			var textInfo = "Connecting to binance in 15 seconds!";
			var objInformation = {
				'protocol': 4,
				'information': textInfo
			};
			clientSocket.write(JSON.stringify(objInformation));
			setTimeout(extractExchangeInfo, 15000);
			console.log(error);
			return;
		}
		let minimums = {};
		for (let obj of data.symbols) {
			let filters = { status: obj.status };
			for (let filter of obj.filters) {
				if (filter.filterType == "MIN_NOTIONAL") {
					filters.minNotional = filter.minNotional;
				} else if (filter.filterType == "PRICE_FILTER") {
					filters.minPrice = filter.minPrice;
					filters.maxPrice = filter.maxPrice;
					filters.tickSize = filter.tickSize;
				} else if (filter.filterType == "LOT_SIZE") {
					filters.stepSize = filter.stepSize;
					filters.minQty = filter.minQty;
					filters.maxQty = filter.maxQty;
				}
			}
			//filters.baseAssetPrecision = obj.baseAssetPrecision;
			//filters.quoteAssetPrecision = obj.quoteAssetPrecision;
			filters.orderTypes = obj.orderTypes;
			filters.icebergAllowed = obj.icebergAllowed;
			minimums[obj.symbol] = filters;
			symbolInfo[obj.symbol] = obj;
			// add symbol in array
			listSymbols.push(obj.symbol);

		}

		//console.log(symbolInfo['ICXUSDT']);

		global.filters = minimums;
		extractExchangeInfoDone = true;
	});
}

extractExchangeInfo();

function isJson(str) {
	try {
		JSON.parse(str);
	} catch (e) {
		return false;
	}
	return true;
}
var lots;

function updateTimeFrame(symbol, timeframe) {
	let endpoints = binance.websockets.subscriptions();

	for (let endpoint in endpoints) {
		if (endpoint.toString().toLowerCase().split("@")[0] == symbol.toLowerCase()) {
			binance.websockets.terminate(endpoint);
		}
	}

	robots[symbol].updateTimeFrame(timeframe);
	// reset the websocket candlesticks
	binance.websockets.chart(robots[symbol].symbol, timeframe, (symbol, interval, chart) => {

		if (robots[symbol] == undefined) return;
		if (!robots[symbol].isActived) return;

		// update series
		symbolSeries[symbol] = binance.array(chart);
		// robot is off
		if (robots[symbol].conditonPhase == robots[symbol].phases.WaitingMACross && robots[symbol].has_EMAShort_Crossed_EMALong(symbolSeries[symbol])) {
			// conditon phase to 1								
			robots[symbol].onCrossed = true;
		}

		robots[symbol].updateEMAsDistance(symbolSeries[symbol]);
		symbolSeriesCanCheck[symbol] = true;
	});
}


var server = net.createServer(function (socket) {
	clientSocket = socket;
	socket.on('data', function (data) {
		if (isJson(data) == false) return;
		var msg = JSON.parse(data);
		// update data to client
		switch (msg.protocol) {
			case 2: // update client data
				var obj = {
					'protocol': 2,
					'robots': robots
				};
				socket.write(JSON.stringify(obj));
				break;
			case 3: // enable disable bot	 
				robots[msg.symbol].swapRobotMode();
				if (robots[msg.symbol].isActived == false) {
					robots[msg.symbol].reset();
					robots[msg.symbol].updateConditionsPhaseName();

				}
				updateClient(msg.symbol);

				break;
			case 4: // try to add symbol
				{
					if (extractExchangeInfoDone == false) {
						var obj = {
							'protocol': 4,
							'information': 'server is still connecting to binance!'
						};
						socket.write(JSON.stringify(obj));
						return;
					}

					if (robots[msg.symbol] != undefined) // you are trying to add a robot that already exits
					{
						var obj = {
							'protocol': 4,
							'information': 'The robot (' + msg.symbol + ') is already added!'
						};
						socket.write(JSON.stringify(obj));
						return;
					}

					// check if exchange has symbol
					for (var i = 0; i <= listSymbols.length - 1; i++) {
						if (listSymbols[i].toLowerCase() == msg.symbol.toLowerCase()) {
							console.log('SE ANADE SIMBOLO');
							robots[msg.symbol] = new Robot(binance);
							robots[msg.symbol].reset();
							robots[msg.symbol].symbol = msg.symbol.toUpperCase();

							robots[msg.symbol].updateTickSize(symbolInfo[robots[msg.symbol].symbol].filters[0].tickSize);
							robots[msg.symbol].updateStepSize(symbolInfo[robots[msg.symbol].symbol].filters[2].stepSize * 1.0);
							var obj = {
								'protocol': 3,
								'robot': robots[msg.symbol]
							};
							socket.write(JSON.stringify(obj));
							binance.websockets.chart(robots[msg.symbol].symbol, robots[msg.symbol].timeFrame, (symbol, interval, chart) => {
								if (robots[symbol] == undefined) return;
								if (!robots[symbol].isActived) return;

								// get past candle data
								symbolSeries[symbol] = binance.array(chart);

								// robot is off
								if (robots[symbol].conditonPhase == robots[symbol].phases.WaitingMACross && robots[symbol].has_EMAShort_Crossed_EMALong(symbolSeries[symbol])) {
									// conditon phase to 1								
									robots[symbol].onCrossed = true;
								}

								robots[symbol].updateEMAsDistance(symbolSeries[symbol]);
								symbolSeriesCanCheck[symbol] = true;
							});

							break;
						}
					}
					// we don't find the symbol
					if (robots[msg.symbol] == undefined) {
						var textMsg = msg.symbol + ' don\'t exists!';
						var obj = {
							'protocol': 4,
							'information': textMsg
						};
						socket.write(JSON.stringify(obj));
					}
				}
				break;
			case 5: // update time frame
				{
					updateTimeFrame(msg.symbol, msg.timeFrame);
				}
				break;
			case 6: // update DT RATE
				robots[msg.symbol].updateDownTrendLimitRate(msg.downTrendLimitRate);
				break;
			case 7: // update PB Rate
				robots[msg.symbol].updatePullBackLimitRate(msg.pullBackLimitRate);
				break;

			case 8: // update DT RATE
				robots[msg.symbol].updateEMAShort(msg.emaShortPeriod);
				break;
			case 9: // update PB Rate
				robots[msg.symbol].updateEMALong(msg.emaLongPeriod);
				break;
			case 10: // update usdt
				if (msg.usdtAmount < 10) {
					var textMsg = 'You need to setup at least (USFT) 10.0';
					var obj = {
						'protocol': 4,
						'information': textMsg
					};
					socket.write(JSON.stringify(obj));
				}
				else
					robots[msg.symbol].updateUSDTAmount(msg.usdtAmount);
				break;
			case 11: // update API SECRET	        	
				API = msg.API;
				SECRET = msg.SECRET;
				const Binance = require('node-binance-api');
				var newInstance = null;
				try {
					newInstance = new Binance().options({
						APIKEY: API,
						APISECRET: SECRET,
						recvWindow: 60000,
						useServerTime: true, // If you get timestamp errors, synchronize to server time at startup
						test: TEST // If you want to use sandbox mode where orders are simulated
					});
				} catch (error) {
					newInstance = null;
				}

				var informationMsg = 'successful modification!';

				if (newInstance == null)
					informationMsg = 'API or Secret wrong!';
				else {
					binance = newInstance;

					var objJson = {
						'APIKEY': API,
						'APISECRET': SECRET
					};
					JSON.stringify(objJson);
					fs.writeFile("API", JSON.stringify(objJson), function (err) {
						if (err) {
							console.log(err);
						}
					});
				}

				var obj = {
					'protocol': 4,
					'information': informationMsg
				};
				socket.write(JSON.stringify(obj));
				break;
			case 12: // update SL
				robots[msg.symbol].updateSL(msg.stopLoss);
				break;
			case 13: // update TP
				robots[msg.symbol].updateTP(msg.takeProfit);
				break;
			case 14: // update MA Type
				robots[msg.symbol].updateMAType(msg.MAType);
				break;

			case 15: // update uptrend %
				robots[msg.symbol].uptrend_percentage = msg.uptrend_percentage;
				break;

			case 16: // update uptrend pb %
				robots[msg.symbol].uptrend_pb_percentage = msg.uptrend_pb_percentage;
				break;

			case 17: // update uptrend button

				robots[msg.symbol].swapRobotUpTrendMode();
				var obj = {
					'protocol': 7,
					'symbol': msg.symbol,
					'actived': robots[msg.symbol].uptrend_on
				};
				socket.write(JSON.stringify(obj));
				break;

			case 18: // update candleCountsToWaitAfterLineCross
				robots[msg.symbol].candleCountsToWaitAfterLineCross = msg.candleCountsToWaitAfterLineCross;
				robots[msg.symbol].candleCountsToWaitAfterLineCrossValue = msg.candleCountsToWaitAfterLineCross;
				break;

			case 19: // button remove
				delete robots[msg.symbol];
				var obj = {
					'protocol': 8,
					'symbol': msg.symbol,
				};
				socket.write(JSON.stringify(obj));
				setTimeout(function () {
					let wsockets = binance.websockets.subscriptions();

					for (let endpoint in wsockets) {
						if (endpoint.toString().toLowerCase().split("@")[0] == msg.symbol.toLowerCase()) {
							binance.websockets.terminate(endpoint);
						}
					}

					console.log("Coin " + msg.symbol + " successful removed!");
				}
					, 5000);

				break;

			case 20: // change buy milliseconds
				robots[msg.symbol].waitToBuyMils = msg.milliseconds;
				break;
			case 21:
				robots[msg.symbol].waitToSellMils = msg.milliseconds;
				break;
			case 22:
				robots[msg.symbol].waitBuyPercentageUp = msg.percentage;
				break;
			case 23:
				robots[msg.symbol].waitBuyPercentageDown = msg.percentage;
				break;
			case 24:
				if (robots[msg.symbol].waitToBuyOn == true)
					robots[msg.symbol].waitToBuyOn = false;
				else
					robots[msg.symbol].waitToBuyOn = true;

				updateClient(msg.symbol);
				break;
			case 25:
				if (robots[msg.symbol].waitToSellOn == true)
					robots[msg.symbol].waitToSellOn = false;
				else
					robots[msg.symbol].waitToSellOn = true;
				updateClient(msg.symbol);
				break;

			case 26: // save button
				var objJson = {
					'robots': robots,
				};
				JSON.stringify(objJson);
				fs.writeFile("layout", JSON.stringify(objJson), function (err) { });

				var obj = {
					'protocol': 4,
					'information': 'Layout successful saved in the server!'
				};
				socket.write(JSON.stringify(obj));
				break;

			case 27: // load button	        	
				fs.readFile('layout', function read(err, data) {

					var layout = JSON.parse(data);
					if (err) {
						//throw err;
					}
					else {
						for (symbol in layout.robots) {
							for (x in robots) {
								// robot open has layout
								if (symbol == x) {
									robots[x].downTrendLimitRate = layout.robots[symbol].downTrendLimitRate;
									robots[x].pullBackLimitRate = layout.robots[symbol].pullBackLimitRate;
									robots[x].uptrend_percentage = layout.robots[symbol].uptrend_percentage;
									robots[x].uptrend_pb_percentage = layout.robots[symbol].uptrend_pb_percentage;
									robots[x].emaLongPeriod = layout.robots[symbol].emaLongPeriod;
									robots[x].emaShortPeriod = layout.robots[symbol].emaShortPeriod;
									robots[x].usdtAmount = layout.robots[symbol].usdtAmount;
									robots[x].stopLoss = layout.robots[symbol].stopLoss;
									robots[x].takeProfit = layout.robots[symbol].takeProfit;
									robots[x].candleCountsToWaitAfterLineCross = layout.robots[symbol].candleCountsToWaitAfterLineCross;
									robots[x].waitToBuyMils = layout.robots[symbol].waitToBuyMils
									robots[x].waitBuyPercentageUp = layout.robots[symbol].waitBuyPercentageUp;
									robots[x].waitBuyPercentageDown = layout.robots[symbol].waitBuyPercentageDown;
									robots[x].waitToSellMils = layout.robots[symbol].waitToSellMils
									robots[x].waitSellPercentageUp = layout.robots[symbol].waitSellPercentageUp;
									robots[x].waitSellPercentageDown = layout.robots[symbol].waitSellPercentageDown;
									robots[x].MAType = layout.robots[symbol].MAType;
									robots[x].timeFrame = layout.robots[symbol].timeFrame;
									updateTimeFrame(x, robots[x].timeFrame);
									robots[x].waitToBuyOn = layout.robots[symbol].waitToBuyOn;
									robots[x].waitToSellOn = layout.robots[symbol].waitToSellOn;
									robots[x].uptrend_on = layout.robots[symbol].uptrend_on;

									robots[x].resetCycle();
								}
							}
						}
						obj = {
							'protocol': 9,
							'robots': robots
						};
						socket.write(JSON.stringify(obj));
					}
				});

				break;

			case 28:
				robots[msg.symbol].waitSellPercentageUp = msg.percentage;
				break;
			case 29:
				robots[msg.symbol].waitSellPercentageDown = msg.percentage;
				break;

			case 30:
				process.exit(1);
				break;

			//###############################################################################################################
			case 55: // buy button

				if (robots[msg.symbol] != undefined) {
					robots[msg.symbol].isActived = true;
					//buy(msg.symbol, true);	
					update(msg.symbol);
					robots[msg.symbol].conditonPhase = robots[msg.symbol].phases.WaitingPullbackOrPriceDrop;
					robots[msg.symbol].pullbackBasePrice = robots[msg.symbol].currentPrice;
					update(msg.symbol);
					updateClient(msg.symbol);
					log = true;
				}
				//const flags = {type: 'MARKET', newOrderRespType: 'FULL'};
				//	binance.marketBuy('ICXUSDT', 1, flags, afterBuy);	
				break;
			case 56: // test

				if (robots[msg.symbol] != undefined) {
					robots[msg.symbol].isActived = true;
					sell(msg.symbol, true);
					update(msg.symbol);
					updateClient(msg.symbol);
					log = true;
				}

				//binance.marketSell('ADAUSDT', 289.0,(error, response) =>{
				//	console.log(response);
				//}

				//);
				break;
			case 57:
				binance.trades("ADAUSDT", (error, trades, symbol) => {
					console.log(symbol + " trade history", trades);
				});
				break;
			case 58:
				binance.balance((error, balances) => {
					if (error) return console.error(error);
					for (x in balances) {
						if (x == 'ADA' || x == 'ICX' || x == 'USDT' || x == 'BNB')
							console.log(x + " balance: ", balances[x]);
					}
				});

				break;
			case 59:
				binance.openOrders('ADAUSDT', (error, openOrders, symbol) => {
					console.log("openOrders(" + symbol + ")", openOrders);

				});
				/*console.log("*************");
				let wsockets = binance.websockets.subscriptions();
				for ( let endpoint in wsockets ) {
					console.log(endpoint);
				}*/

				break;
		}
	});

});

// when client connects, update clients with new data
server.on('connection', function (socket) {
	var obj = {
		'protocol': 5,
		'robots': robots
	};
	console.log('User connected')
	socket.write(JSON.stringify(obj));
});

server.listen(8888, '127.0.0.1');
//server.listen(8080, '172.31.0.1');



var inTrade = false;
var symbolInTrade = '';
var debug = false;

var trading_buy = [];
var trading_sell = [];



function buy(x) {
	robots[x].conditonPhase = robots[x].phases.trading;
	robots[x].updateLots(binance.roundStep(robots[x].usdtAmount / global.ticker[x].bestBid * 1.0, robots[x].stepSize));
	symbolInTrade = robots[x].symbol;
	const flags = { type: 'MARKET', newOrderRespType: 'FULL' };
	if (debug == false) {
		trading_buy[x] = true;
		setTimeout(function (symbol) {
			if (trading_buy[symbol] == true) {

				robots[symbol].conditonPhase = robots[symbol].phases.Off;
				robots[symbol].resetCycle();
			}
		}
			, 1000, x);
		binance.marketBuy(x, robots[x].lots, flags, afterBuy);
	}
	else {
		robots[x].updateOpenedPrice(robots[x].bidPrice);
		robots[x].updateSLPrice(robots[x].openedPrice * (1.0 - robots[x].stopLoss / 100.0));
		robots[x].updateTPPrice(robots[x].openedPrice * (1.0 + robots[x].takeProfit / 100.0));

		if (robots[x].uptrend_on == false) {
			robots[x].conditonPhase = robots[x].phases.WaitingTPOrSL;
			//console.log(x + "WaitingTPOrSL");
		}
		else {
			robots[x].conditonPhase = robots[x].phases.WaitingToEnterInUPTrendOrSL;
			//console.log(x + "WaitingToEnterInUPTrendOrSL");
		}
	}
}

function sell(x) {
	robots[x].conditonPhase = robots[x].phases.trading;
	const flags = { type: 'MARKET', newOrderRespType: 'FULL' };
	if (debug == false) {
		trading_sell[x] = true;
		setTimeout(function (symbol) {
			if (trading_sell[symbol] == true) {

				robots[symbol].conditonPhase = robots[symbol].phases.Off;
				robots[symbol].resetCycle();
			}
		}
			, 1000, x);

		binance.marketSell(x, robots[x].lots, flags, afterSell);
	}
	else {

		robots[x].conditonPhase = robots[x].phases.Off;
		robots[x].resetCycle();

	}
}

function afterBuy(error, response) {
	//console.log(x, response, "buy");
	if (error) {
		var query = error.request.uri.query;
		var symbol = query.split("&")[0].split("=")[1];
		if (symbol != undefined) {
			robots[symbol].conditonPhase = robots[symbol].phases.Off;
			robots[symbol].reset();
		}
	}
	else {

		if (response == undefined) return;
		//console.log(response);
		var symbol = response.symbol;
		if (symbol != undefined) {
			//**here is the second key HUASCAR */
			robots[symbol].updateOpenedPrice(response.fills[0].price);
			robots[symbol].updateSLPrice(robots[symbol].openedPrice * (1.0 - robots[symbol].stopLoss / 100.0));
			robots[symbol].updateTPPrice(robots[symbol].openedPrice * (1.0 + robots[symbol].takeProfit / 100.0));


			if (robots[symbol].uptrend_on == false) {
				robots[symbol].conditonPhase = robots[symbol].phases.WaitingTPOrSL;
				//console.log(x + "WaitingTPOrSL");
			}
			else {
				robots[symbol].conditonPhase = robots[symbol].phases.WaitingToEnterInUPTrendOrSL;
				//console.log(x + "WaitingToEnterInUPTrendOrSL");
			}

			trading_buy[symbol] = false;
			update(symbol);
			updateClient(symbol);
		}
	}
	if (log == true)
		console.log(response);
	log = false;
}

function afterSell(error, response) {
	if (error) {
		var query = error.request.uri.query;
		var symbol = query.split("&")[0].split("=")[1];
		if (symbol != undefined) {
			robots[symbol].conditonPhase = robots[symbol].phases.Off;
			robots[symbol].reset();
		}
	}
	else {

		if (response == undefined) return;
		//console.log(response);
		var symbol = response.symbol;
		if (symbol != undefined) {
			robots[symbol].conditonPhase = robots[symbol].phases.Off;
			robots[symbol].resetCycle();
			update(symbol);
			updateClient(symbol);
		}
	}
	if (log == true)
		console.log(response);
	log = false;
}

function updateTimer(symbol) {
	//console.log("timer");
	//if(debug)
	//console.log("update timer");
	var obj = {
		'protocol': 11,
		'robot': robots[symbol]
	};
	try {
		clientSocket.write(JSON.stringify(obj));
	} catch (error) {

	}

	if (robots[symbol].timerBUY > 0 || robots[symbol].timerSELL > 0)
		setTimeout(function (symbol) { updateTimer(symbol); }, 800, symbol);
}

function update(x) {
	if (robots[x] == undefined) return;

	// robot need to be actived
	if (robots[x].isActived == false) return;

	var symbol = robots[x].symbol;

	if (!global.ticker[symbol]) return;


	// update current price
	// let's update symbols
	robots[x].bidPrice = global.ticker[symbol].bestBid * 1.0;
	robots[x].askPrice = global.ticker[symbol].bestAsk * 1.0;
	robots[x].currentPrice = global.ticker[symbol].close * 1.0;

	// used when robot start's
	if (robots[x].onStart == true) {
  	
		robots[x].conditonPhase = robots[x].phases.WaitingMACross;
		if (debug) {

			if (x == 'ICXUSDT') {

				//robots[x].UpTrendBasePrice = robots[x].currentPrice;
				//robots[x].conditonPhase = robots[x].phases.SellingMode;
			}

			console.log("on start");
		}
		robots[x].onStart = false;
	}

	if (robots[x].onCrossed == true) {
		robots[x].onCrossed = false;
		robots[x].firstCandleCount = true;
		robots[x].conditonPhase = robots[x].phases.CountCandles;
		//console.log(x + "//onCrossed//" + robots[x].candleCountsToWaitAfterLineCrossValue);
		if (robots[x].candleCountsToWaitAfterLineCrossValue == 0) {
			robots[x].conditonPhase = robots[x].phases.WaitingDownTrend;
			robots[x].downTrendBasePrice = robots[x].currentPrice;
			if (debug)
				console.log(x + "crossed -> waiting DT");
		}
	}

	if (robots[x].conditonPhase == robots[x].phases.CountCandles && symbolSeriesCanCheck[x] == true) {
		robots[x].checkIfHasDidAtLeastxCandlesAfterLineCross(symbolSeries[x]);
		symbolSeriesCanCheck[x] = false;
	}

	if (robots[x].conditonPhase == robots[x].phases.WaitingDownTrend) {
		robots[x].updateDownTrendRate();
		if (robots[x].has_DownTrendLimitReached()) {
			//console.log(x + "WaitingPullbackOrPriceDrop");
			robots[x].conditonPhase = robots[x].phases.WaitingPullbackOrPriceDrop;
			robots[x].pullbackBasePrice = robots[x].currentPrice;
			if (debug)
				console.log(x + "waiting PB");
		}
		else if (robots[x].currentPrice > robots[x].crossedPrice && robots[x].onCandleClose(symbolSeries[x]) == true) {
			//console.log(this.symbol + "reset above line//close price:",close);
			robots[x].resetCycle();
			if (debug)
				console.log(x + "Reset DT");
		}
	} // update trend down	

	// DT - waiting pull back
	if (robots[x].conditonPhase == robots[x].phases.WaitingPullbackOrPriceDrop) {
		robots[x].updatePullBackRate();
		if (robots[x].has_pullbackLimitReached()) {
			if (robots[x].waitToBuyOn == true) {
				if (debug)
					console.log(x + "wait to buy");
				robots[x].waitCanBuy = false;
				robots[x].conditonPhase = robots[x].phases.waittobuy;
				robots[x].timerBUY = robots[x].waitToBuyMils;
				robots[x].FunWaitTobuyMilis();
				robots[x].counterBUY();
				updateTimer(x);
				robots[x].waitBasePrice = robots[x].pullbackBasePrice * (1 + robots[x].pullBackLimitRate / 100.0);
				robots[x].attemptsInPhaseWaitToBuy = 0;
			}
			else {
				if (debug)
					console.log(x + "buy");
				buy(x);
			}

		}
		// reset the base price
		if (robots[x].currentPrice < robots[x].pullbackBasePrice) {
			robots[x].pullbackBasePrice = global.ticker[symbol].close * 1.0;
		}
	}


	if (robots[x].conditonPhase == robots[x].phases.waittobuy) {

		// goes up fast buy
		if (robots[x].hasWaitBasePriceUp()) {
			buy(x);
			if (debug)
				console.log(x + "buy hasWaitBasePriceUp");
			return;
		}
		if (robots[x].hasWaitBasePriceDown()) // reset to  pullback
		{
			if (debug)
				console.log(x + "WaitingPullbackOrPriceDrop hasWaitBasePriceDown");
			robots[x].conditonPhase = robots[x].phases.WaitingPullbackOrPriceDrop;
			//robots[x].pullbackBasePrice = global.ticker[symbol].close * 1.0;
			return;
		}

		// end the time ?
		if (robots[x].waitCanBuy == true) {
			if (debug)
				console.log(x + "reset waittobuy");
			robots[x].waitCanBuy = false;

			if (robots[x].hasPriceMovedUp())
				buy(x);
			else//(robots[x].hasWaitBasePriceDown())
			{
				robots[x].conditonPhase = robots[x].phases.WaitingPullbackOrPriceDrop;
				//robots[x].pullbackBasePrice = global.ticker[symbol].close * 1.0;
			}

			robots[x].timerBUY = 0;
		}
	}

	//################################################################
	if (robots[x].conditonPhase == robots[x].phases.waittosell) {
		// goes up fast buy
		if (robots[x].hasWaitBasePriceDown()) {
			sell(x);
			if (debug)
				console.log(x + "sell hasWaitBasePriceDown");
			return;

		}
		if (robots[x].hasWaitBasePriceUp()) {
			if (debug)
				console.log(x + "hasWaitBasePriceUp UpTrend");
			robots[x].conditonPhase = robots[x].phases.KeepGrowing;
			return;
		}

		// end the time ?
		if (robots[x].waitCanSell == true) {

			if (debug)
				console.log(x + "reset waittosell");
			robots[x].waitCanSell = false;

			if (robots[x].hasPriceMovedDown()) {
				if (debug)
					console.log(x + "sell");
				sell(x);
			}
			else //if(robots[x].hasPriceMovedUp())
			{

				if (debug)
					console.log(x + "hasPriceMovedUp");
				robots[x].conditonPhase = robots[x].phases.KeepGrowing;
				//robots[x].uptrendPB_rate = 0;
			}
			robots[x].timerSELL = 0;
		}
	}


	if (robots[x].conditonPhase == robots[x].phases.WaitingToEnterInUPTrendOrSL) {
		if (robots[x].checkTakeProfit() == true) {
			if (debug)
				console.log(x + "TPPrice -> uptrend");
			robots[x].UpTrendBasePrice = robots[x].TPPrice;
			robots[x].conditonPhase = robots[x].phases.UpTrend;
			//console.log(x + "UpTrend");		
		}
		else if (robots[x].checkStopLoss() == true) {
			if (debug)
				console.log(x + "SL");
			sell(x);
		}
		//check if the price has meet the second TP price
		else if(true){

		}
	}

	if (robots[x].conditonPhase == robots[x].phases.UpTrend) {
		robots[x].updateUpTrendRate();
		robots[x].updateUpTrendPBRate();
		if (robots[x].has_upTrendReachedPercentage()) {
			//console.log(x + "SellingMode");		
			//robots[x].upTrendRepositionSupAndResistence();
			robots[x].conditonPhase = robots[x].phases.KeepGrowing;
			/// Fixing              ##############################################################################
			robots[x].UpTrendPullBackBasePrice = robots[x].currentPrice;
			if (debug)
				console.log(x + "SellingMode");
		}
		else if (robots[x].checkStopLoss() == true) {
			if (debug)
				console.log(x + "SL_Sell");
			sell(x);
		}
	}

	if (robots[x].conditonPhase == robots[x].phases.KeepGrowing) {
		robots[x].updateUpTrendRate();
		robots[x].updateUpTrendPBRate();

		if (robots[x].currentPrice > robots[x].UpTrendPullBackBasePrice) {
			robots[x].UpTrendPullBackBasePrice = robots[x].currentPrice;
			if (debug)
				console.log(x + "UpTrendBasePrice reseted");
		}

		if (robots[x].has_upTrendReachedPB()) {
			if (robots[x].waitToSellOn == true) {
				if (debug)
					console.log(x + "wait to SELL");
				robots[x].waitCanSell = false;
				robots[x].conditonPhase = robots[x].phases.waittosell;
				robots[x].timerSELL = robots[x].waitToSellMils;
				robots[x].FunWaitTosellMilis();
				robots[x].counterSELL();
				updateTimer(x);
				// ##############################################################################################
				robots[x].waitBasePrice = robots[x].UpTrendPullBackBasePrice * (1 - robots[x].uptrend_pb_percentage / 100);
				robots[x].attemptsInPhaseWaitToSell = 0;
			}
			else {
				if (debug)
					console.log(x + "TP_Sell");
				sell(x);
			}
		}
	}

	if (robots[x].conditonPhase == robots[x].phases.SellingMode) {
		if (robots[x].currentPrice > robots[x].UpTrendPullBackBasePrice) {
			robots[x].UpTrendPullBackBasePrice = robots[x].currentPrice;
			if (debug)
				console.log(x + "UpTrendBasePrice reseted");
		}

		robots[x].updateUpTrendRate();
		robots[x].updateUpTrendPBRate();
		if (robots[x].has_upTrendReachedPB()) {
			if (robots[x].waitToSellOn == true) {
				if (debug)
					console.log(x + "wait to SELL");
				robots[x].waitCanSell = false;
				robots[x].conditonPhase = robots[x].phases.waittosell;
				robots[x].timerSELL = robots[x].waitToSellMils;
				robots[x].FunWaitTosellMilis();
				robots[x].counterSELL();
				updateTimer(x);
				// ##############################################################################################
				robots[x].waitBasePrice = robots[x].UpTrendPullBackBasePrice * (1 - robots[x].uptrend_pb_percentage / 100);
				robots[x].attemptsInPhaseWaitToSell = 0;
			}
			else {
				if (debug)
					console.log(x + "TP_Sell");
				sell(x);
			}
		}
	}

	// stop loss and sell
	if (robots[x].conditonPhase == robots[x].phases.WaitingTPOrSL) {
		if (robots[x].checkStopLoss() == true) {
			sell(x);
			if (debug)
				console.log(x + "SL_Sell");
		}
		else if (robots[x].checkTakeProfit() == true) {
			sell(x);
			if (debug)
				console.log(x + "TP_Sell");
		}
	}

	robots[x].updateConditionsPhaseName();

}

function updateClient(x) {
	var obj = {
		'protocol': 2,
		'symbol': x,
		'robot': robots[x]
	};
	try {

		clientSocket.write(JSON.stringify(obj));
	} catch (error) { }
}

// Update the precies for all symbolos in binance API
var cprev =0;
binance.websockets.prevDay(false, function (error, obj) {
	global.ticker[obj.symbol] = obj;

	if (robots[obj.symbol] != undefined) {
		if (robots[obj.symbol].isActived) {
			console.log('MEJOR OFERTA PARA '+obj.symbol+': ', obj.bestBid)
			update(obj.symbol);
			updateClient(obj.symbol);
		}
	}
});