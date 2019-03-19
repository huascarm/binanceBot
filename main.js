
var net = require('net');
var Robot = require('./robot.js');

var binance = require('node-binance-api')().options({
	APIKEY: 'mXpvqhYpSRGhcntQ7JFallsD6BpEvHANQyv5urcIyJou1UZ1w7IvebpiDUrnFPTU',
	APISECRET: 'mnlOHUNVlNjyfFGSL1EOdSoqyEbELLFtgpXHKBy3fXiyJOb8UOUng5hAQ3pWzsBL',
	recvWindow: 60000,
	useServerTime: true, // If you get timestamp errors, synchronize to server time at startup
	test: false // If you want to use sandbox mode where orders are simulated
});

API = ""
SECRET = ""

// instance of robot
var robots = {};
var timeCrossed = new Date();
global.ticker = {};

// program data
var listSymbols = [];
var symbolInfo = [];

binance.exchangeInfo(function (error, data) {
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

});

// Get 24h price change statistics for all symbols
binance.websockets.prevDay(false, function (error, obj) {
	global.ticker[obj.symbol] = obj;
});


setInterval(() => {

	//console.log("\n\n");
	for (x in robots) {

		robots[x].updateConditionsPhaseName();

		//console.log(robots[x].conditonPhaseName);
		// robot need to be actived
		if (robots[x].isActived == false) continue;

		var symbol = robots[x].symbol;

		if (!global.ticker[symbol]) continue;

		// used when robot start's
		if (robots[x].onStart == true) {

			//////////////////////////// testttttttttttttttttttt    	
			//robot.pullbackBasePrice = global.ticker[symbol].bestBid;
			//robot.downTrendBasePrice =  robot.pullbackBasePrice + 1000 * robot.tickSize;		
			//robot.conditonPhase = robot.phases.WaitingPullbackOrPriceDrop;   
			robots[x].conditonPhase = robots[x].phases.WaitingMACross;

			// do not use until strategy close
			robots[x].onStart = false;

			for (var y in symbolInfo) {
				if (y == robots[x].symbol) {
					SYMBOL = symbolInfo[y].baseAsset;
					binance.balance((error, balances) => {
						if (error) return console.error(error);
						// we have a open position
						//console.log(balances[SYMBOL].available)
						if (balances[SYMBOL].available > 0.0) {
							// let's wait SL or sell
							//console.log(balances[symbolInfo[x].baseAsset] );
							//robot.conditonPhase = robot.phases.WaitingTPOrSL;
						}

					});
				}
			}
		}
		// update current price
		robots[x].currentPrice = global.ticker[symbol].bestBid * 1.0;

		if (robots[x].onCrossed == true) {

			robots[x].downTrendBasePrice = global.ticker[symbol].bestBid * 1.0;
			var date = new Date();
			date.setTime(global.ticker[symbol].closeTime);
			robots[x].onCrossed = false;
			robots[x].priceCrossed = global.ticker[symbol].bestBid * 1.0;
			//console.log(d.getHours() +":"+ d.getMinutes() + ":" + d.getSeconds()+ " " + d.getDate() + "-" + d.getMonth() + "-" + d.getFullYear());
			robots[x].timeCrossed = date.getHours() + ":" + date.getMinutes() + ":" + date.getSeconds() +
				" " + date.getDate() + "-" + date.getMonth() + "-" + date.getFullYear()
		}

		//timeCrossed.setTime(global.ticker.BTCUSDT.closeTime)

		// let's update symbols
		robots[x].bidPrice = global.ticker[symbol].bestBid * 1.0;
		robots[x].askPrice = global.ticker[symbol].bestAsk * 1.0;
		if (robots[x].conditonPhase == robots[x].phases.WaitingDownTrend) {
			robots[x].updateDownTrendRate();
		} // update trend down	

		if (robots[x].conditonPhase == robots[x].phases.WaitingPullbackOrPriceDrop) {
			robots[x].updatePullBackRate();
		}// update the pullback

		// EMA crossed -- waiting DT 
		if (robots[x].conditonPhase == robots[x].phases.WaitingMACross && robots[x].has_DownTrendLimitReached()) {
			robots[x].pullbackBasePrice = global.ticker[symbol].bestBid * 1.0;
			robots[x].conditonPhase = robots[x].phases.WaitingPullbackOrPriceDrop;
		}

		// DT - waiting pull back
		if (robots[x].conditonPhase == robots[x].phases.WaitingPullbackOrPriceDrop) {
			if (robots[x].has_pullbackLimitReached())
				robots[x].conditonPhase = robots[x].phases.Buying;
			// reset pull back price - the down trend returned
			else if (robots[x].currentPrice < robots[x].pullbackBasePrice) {
				robots[x].pullbackBasePrice = robots[x].currentPrice;
				robots[x].updateDownTrendRate();
			}
		}

		// buy mode
		if (robots[x].conditonPhase == robots[x].phases.Buying) {
			// convert usdt to lot's
			// get last quote of ask price
			robots[x].updateLots(robots[x].usdtAmount / global.ticker[x].bestAsk);
			binance.marketBuy(robot.symbol, robots[x].lots, (error, response) => {
				robots[x].updateOpenedPrice(response.fills[0].price * 1.0);
			});
			robots[x].conditonPhase = robots[x].phases.WaitingTPOrSL;
		}

		// stop loss and sell ** here is the key HUASCAR
		if (robots[x].conditonPhase == robots[x].phases.WaitingTPOrSL) {
			if (robots[x].checkStopLoss() == true) {
				robots[x].resetCycle();
			}
			else if (robots[x].checkTakeProfit() == true) {
				robots[x].resetCycle();
			}
		}
	}

}, 50);

function isJson(str) {
	try {
		JSON.parse(str);
	} catch (e) {
		return false;
	}
	return true;
}

var server = net.createServer(function (socket) {
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
				var textInfo = "";
				if (robots[msg.symbol].takeProfit <= 0) {
					textInfo = 'take profit should be > 0';
				}
				if (robots[msg.symbol].stopLoss <= 0) {
					textInfo = 'stop loss should be > 0';
				}
				if (robots[msg.symbol].usdtAmount <= 0) {
					textInfo = 'usdt amount should be > 0';
				}
				if (robots[msg.symbol].downTrendLimitRate <= 0) {
					textInfo = 'down trend % should be > 0';
				}
				if (robots[msg.symbol].pullBackLimitRate <= 0) {
					textInfo = 'pull back % should be > 0';
				}
				if (textInfo != "" && robots[msg.symbol].isActived == false) {
					var objInformation = {
						'protocol': 4,
						'information': textInfo
					};
					socket.write(JSON.stringify(objInformation));
					return;
				}
				robots[msg.symbol].swapRobotMode();
				if (robots[msg.symbol].isActived == false)
					robots[msg.symbol].reset();
				var obj = {
					'protocol': 6,
					'symbol': msg.symbol,
					'actived': robots[msg.symbol].isActived
				};
				socket.write(JSON.stringify(obj));
				break;
			case 4: // try to add symbol
				{
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
							robots[msg.symbol] = new Robot(binance);
							robots[msg.symbol].reset();
							robots[msg.symbol].symbol = msg.symbol.toUpperCase();

							robots[msg.symbol].updateTickSize(symbolInfo[robots[msg.symbol].symbol].filters[0].tickSize);
							robots[msg.symbol].updateBaseAsset(symbolInfo[robots[msg.symbol].symbol].baseAsset);
							var obj = {
								'protocol': 3,
								'robot': robots[msg.symbol]
							};
							socket.write(JSON.stringify(obj));

							binance.websockets.chart(robots[msg.symbol].symbol, robots[msg.symbol].timeFrame, (symbol, interval, chart) => {

								if (!robots[msg.symbol].isActived) return;

								//console.log(chart);

								// update series
								var series = binance.array(chart);
								// robot is off
								if (robots[msg.symbol].conditonPhase == robots[msg.symbol].phases.WaitingMACross && robots[msg.symbol].has_EMAShort_Crossed_EMALong(series)) {
									// conditon phase to 1
									robots[msg.symbol].conditonPhase = robots[msg.symbol].phases.WaitingDownTrend;
									robots[msg.symbol].onCrossed = true;
								}

								//console.log("[TM:1m], "+"[SMA LONG:", (longCurSMA).toFixed(2)+ "], [SMA SHORT:", (shotCurSMA).toFixed(2)+"], [crossed:" + crossed + "("+countCrossed+")] "
								//	      +"["+timeCrossed.getHours() +":"+ timeCrossed.getMinutes() + ":" + timeCrossed.getSeconds()+ 
								//         " " + timeCrossed.getDate() + "-" + timeCrossed.getMonth() + "-" + timeCrossed.getFullYear() +
								//         "] [longCurSMA > shotCurSMA:" + (longCurSMA > shotCurSMA) +"]");

								//var myElement = global.document.getElementById("Table_1.1");
								//myElement.innerHTML = symbol;

								// update symbol's data
								//console.log(series);
								robots[msg.symbol].updateEMAsDistance(series);
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
					let endpoints = binance.websockets.subscriptions();
					for (let endpoint in endpoints) {
						if ((robots[msg.symbol].symbol.toLowerCase() + '@kline_' + robots[msg.symbol].timeFrame) == endpoint)
							binance.websockets.terminate(robots[msg.symbol].symbol.toLowerCase() + '@kline_' + robots[msg.symbol].timeFrame);
					}

					robots[msg.symbol].updateTimeFrame(msg.timeFrame);
					// reset the websocket candlesticks
					binance.websockets.chart(robots[msg.symbol].symbol, robots[msg.symbol].timeFrame, (symbol, interval, chart) => {

						if (!robots[msg.symbol].isActived) return;

						//console.log(chart);

						// update series
						var series = binance.array(chart);
						//console.log(robot.conditonPhase);
						// robot is off
						if (robots[msg.symbol].conditonPhase == robots[msg.symbol].phases.WaitingMACross && robots[msg.symbol].has_EMAShort_Crossed_EMALong(series)) {
							// conditon phase to 1
							robots[msg.symbol].conditonPhase = robots[msg.symbol].phases.WaitingDownTrend;
							robots[msg.symbol].onCrossed = true;
						}

						robots[msg.symbol].updateEMAsDistance(series);
					});
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
						test: false // If you want to use sandbox mode where orders are simulated
					});
				} catch (error) {
					newInstance = null;
				}

				var informationMsg = 'successful modification!';

				if (newInstance == null)
					informationMsg = 'API or Secret wrong!';
				else
					binance = newInstance;
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
			case 55: // test
				let quantity = symbolInfo['ICXUSDT'].filters[1].minQty;
				binance.marketBuy(robot.symbol, quantity, (error, response) => {
					console.log(response);
				});
				console.log("buy");
				break;
			case 56: // test
				binance.marketSell("ICXUSDT", symbolInfo['ICXUSDT'].filters[1].minQty);
				console.log("sell");
				break;
			case 57:
				binance.trades("ICXUSDT", (error, trades, symbol) => {
					console.log(symbol + " trade history", trades);
				});
				break;
			case 58:
				binance.balance((error, balances) => {
					if (error) return console.error(error);
					console.log("USDT balance: ", balances.USDT);
					console.log("BNB balance: ", balances.BNB);
					console.log("ICX balance: ", balances.ICX);
					console.log("ADA balance: ", balances.ADA);
				});
				break;
			case 59:
				binance.openOrders('ICXUSDT', (error, openOrders, symbol) => {
					console.log("openOrders(" + symbol + ")", openOrders);

				});
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
	socket.write(JSON.stringify(obj));
});

server.listen(8888, '127.0.0.1');
//server.listen(8080, '172.31.0.1');