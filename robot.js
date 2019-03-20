module.exports = class Robot{
	constructor(binance){
		this.binance = binance;
	    this.phases = {"Off":1, "WaitingMACross":2, "WaitingDownTrend":3, "WaitingPullbackOrPriceDrop" :4,
	                   "TryningToBuying" : 5, "WaitingTPOrSL": 6, 
	                   "WaitingBUYProcess": 7, "WaitingSELLProcess" : 8, "SL_Sell" : 9, "TP_Sell" : 10,
	                   "PossibleEnterInDownTrend" : 11, "UpTrend" : 12,
	                   "deciding" : 13, "WaitingToEnterInUPTrendOrSL" : 14,
	                   "SellingMode" : 15, "CountCandles" : 16,
	                   "waittobuy" : 17, "waittosell": 18,
	                   "trading" : 19, "waittosell" : 20, 
	                   "KeepGrowing": 21};
	    
		this.symbol = "BTCUSDT";
		this.bidPrice = 0.0;
		this.askPrice = 0.0;
		this.timeFrame = "1m";
		this.downTrendRate = 0.0; // current
		this.downTrendLimitRate = 1.0;
		this.pullBackRate = 0.0; // current
		this.pullBackLimitRate = 0.5;
		this.UPTrendSupportPercentage = 0.2;
		this.UPTrendResistencePercentage = 0.2;
		this.emasDistance = 0;
		this.lots = 0.0; // USDT
		this.usdtAmount = 12; 
		this.positionType = "-";
		this.openedPrice = 0.0;
		this.stopLoss = 2;
		this.unexpectedDropPercentage = 1;
		this.takeProfit = 0.5;
		this.tickSize = 0.0;
		this.stepSize = 0.0;
		this.conditonPhaseName = "Off";
		this.emaShortPeriod = 5;
		this.emaLongPeriod = 20;	
		this.isActived = false;
		this.MAType = "smooth";
		
		this.uptrend_percentage = 1;
		this.uptrend_pb_percentage = 0.5;
		this.uptrend_on = false;
		this.uptrend_rate = 0;
		this.uptrendPB_rate = 0;

		// once line cross wait candles
		this.xCandlesWait_on = false;

		// price em EMA short cross EMA long
		this.crossedPrice = 0;		
		// time crossed
		this.timeCrossed = 0;
		// price above crossedPrice
		this.downTrendBasePrice = 0;
		this.pullbackBasePrice = 0;
		this.UpTrendBasePrice = 0;
		this.UpTrendPullBackBasePrice = 0;
		this.upTrendLimitPrice = 0;
		// current price
		this.currentPrice = 0.0;
		// is looking for condition 
		// [0] no conditions 
		// [1] crossed EMA
		// [2] price down trend 1%
		// [3] price pull back 0.5%
		this.conditonPhase = this.phases.Off;		
		// start (once actived it will start once)
		this.onStart = true;
		// when crossed
		this.onCrossed = false;
		this.baseAsset = "";
		this.balanceChecked = false;

		this.SLPrice = 0.0;
		this.TPPrice = 0.0;

		this.longMA = 0;
		this.shortMA = 0;

		this.canSell = true;
		this.canBuy = true;

		this.candleCountsToWaitAfterLineCross = 3;
		this.candleCountsToWaitAfterLineCrossValue;


		this.waitBasePrice = 0;
		this.waitCanBuy = false;
		this.waitCanSell= false;

		this.waitToBuyMils = 60;
		this.waitToSellMils = 60;

		this.waitBuyPercentageUp= 0.2;
		this.waitBuyPercentageDown=0.2;
		this.waitSellPercentageUp= 0.2;
		this.waitSellPercentageDown=0.2;


		this.waitToBuyOn = false;
		this.waitToSellOn = false;

		this.attempts = 0;
		this.attemptsInPhaseWaitToBuy = 0;
		this.attemptsInPhaseWaitToSell = 0;
		this.series = {};

		this.firstCandleCount = false;

		this.w8ToBuy_UP_rate;
		this.w8ToBuy_DOWN_rate;
		this.w8ToSell_UP_rate;
		this.w8ToSell_DOWN_rate;

		this.timerBUY;
		this.timerSELL;
	}

	counterBUY()
	{
		if(this.timerBUY > 0){
			this.timerBUY--;
			setTimeout(function(robot) { robot.counterBUY();}, 1000, this);	
		}
	}

	counterSELL()
	{
		if(this.timerSELL > 0){
			this.timerSELL--;
			setTimeout(function(robot) { robot.counterSELL();}, 1000, this);	
		}
	}
	/*

	decreaseTimer()
	{
		setTimeout(function (robot){
			if(robot.timer > 0)
			{

				robot.timer--;
				robot.decreaseTimer();
			}

		},1000, this) ;
	}
	*/
	
	FunWaitTobuyMilis()
	{
		//console.log("FunWaitTobuyMilis");
		setTimeout(
			function (robot){
					robot.waitCanBuy = true;
	    			robot.attemptsInPhaseWaitToBuy++;
	    			robot.timer = 0;
	    	},this.waitToBuyMils * 1000, this) ;
		this.timer = this.waitToBuyMils;
		//this.decreaseTimer();
	}

	FunWaitTosellMilis()
	{
		//console.log("waittosell");
		setTimeout(
			function (robot){
					robot.waitCanSell = true;
	    			robot.attemptsInPhaseWaitToSell++;
	    			robot.timer = 0;
	    	},this.waitToSellMils * 1000, this) ;
		this.timer = this.waitToSellMils;
		//this.decreaseTimer();
	}

	hasWaitBasePriceUp()
	{
		var limitRate = 0;
		if(this.waitBasePrice == 0) return false;
		if(this.conditonPhase == this.phases.waittobuy){
			this.w8ToBuy_UP_rate = Math.abs(this.waitBasePrice - this.currentPrice)/this.waitBasePrice;
			limitRate = this.waitBuyPercentageUp;
			if(this.currentPrice <= this.waitBasePrice)
			{
				this.w8ToBuy_UP_rate = 0;
			}
		}
		if(this.conditonPhase == this.phases.waittosell){
			this.w8ToSell_UP_rate = Math.abs(this.waitBasePrice - this.currentPrice)/this.waitBasePrice;
			limitRate = this.waitSellPercentageUp;
			if(this.currentPrice <= this.waitBasePrice)
			{
				this.w8ToSell_UP_rate = 0;
			}
		}
		if(Math.abs(this.waitBasePrice - this.currentPrice)/this.waitBasePrice >= limitRate/100.0 &&
		   this.currentPrice > this.waitBasePrice)
			return true;

		//console.log("waitBasePrice",this.waitBasePrice);
		//console.log("w8ToBuy_UP_rate",this.w8ToBuy_UP_rate);
		//console.log("w8ToSell_UP_rate",this.w8ToSell_UP_rate);

		return false;
	}

	hasPriceMovedUp()
	{
		if(this.waitBasePrice == 0) return false;

		if(this.currentPrice > this.waitBasePrice)
			return true;
		return false;
	}

	hasPriceMovedDown()
	{
		if(this.waitBasePrice == 0) return false;

		if(this.currentPrice < this.waitBasePrice)
			return true;

		return false;
	}

	hasWaitBasePriceDown()
	{

		var limitRate = 0;
		if(this.waitBasePrice == 0) return false;
		if(this.conditonPhase == this.phases.waittobuy){
			this.w8ToBuy_DOWN_rate = Math.abs(this.waitBasePrice - this.currentPrice)/this.waitBasePrice;
			limitRate = this.waitBuyPercentageDown;
			if(this.currentPrice >= this.waitBasePrice)
			{
				this.w8ToBuy_DOWN_rate = 0;
			}
		}
		if(this.conditonPhase == this.phases.waittosell){
			this.w8ToSell_DOWN_rate = Math.abs(this.waitBasePrice - this.currentPrice)/this.waitBasePrice;
			limitRate = this.waitSellPercentageDown;
			if(this.currentPrice >= this.waitBasePrice)
			{
				this.w8ToSell_DOWN_rate = 0;
			}
		}

		
		if(Math.abs(this.waitBasePrice - this.currentPrice)/this.waitBasePrice >= limitRate/100.0 &&
		   this.currentPrice < this.waitBasePrice)
			return true;

		return false;
	}

	has_EMAShort_Crossed_EMALong(series){
		if(series[series.length - 1][1].close == undefined) return false;
			// previous sma candle current + 2
		var longPrevSMA =0;
		var shotPrevSMA=0;
			//
		var longPrev2SMA =0;
		var shotPrev2SMA =0;
		//console.log(this.MAType );
		if(this.MAType == "smooth")
		{
			// current sma
			this.longMA = this.sma(series,this.emaLongPeriod);
			this.shortMA = this.sma(series,this.emaShortPeriod);
			// previous sma candle current + 2
			longPrevSMA = this.sma(series,this.emaLongPeriod, 1);
			shotPrevSMA = this.sma(series,this.emaShortPeriod, 1);
			
			longPrev2SMA = this.sma(series,this.emaLongPeriod, 2);
			shotPrev2SMA = this.sma(series,this.emaShortPeriod, 2);	
		}
		else{
			this.longMA = this.ema(series,this.emaLongPeriod);
			this.shortMA = this.ema(series,this.emaShortPeriod);
			//console.log("\n###########\n",this.shortMA, "\n", this.longMA);
			// previous sma candle current + 2
			longPrevSMA = this.ema(series,this.emaLongPeriod, 1);
			shotPrevSMA = this.ema(series,this.emaShortPeriod, 1);
			//
			longPrev2SMA = this.ema(series,this.emaLongPeriod, 2);
			shotPrev2SMA = this.ema(series,this.emaShortPeriod, 2);	
		}

		if((shotPrev2SMA > longPrev2SMA || shotPrevSMA >= longPrevSMA) && this.shortMA <= this.longMA && series[series.length - 1][1].isFinal != false){
			this.crossedPrice = series[series.length - 1][1].close;		
			//console.log(this.symbol + "// (CROSSED PRICE):"+this.crossedPrice);
			return true;
		}
		else
			return false;
	}

	onCandleClose(series)
	{
		if(series[series.length - 1][1].isFinal != false)
			return true;
		else 
			return false;
	}

	checkIfHasDidAtLeastxCandlesAfterLineCross(series){	
		// on candle close
		if(this.firstCandleCount == true){
			this.firstCandleCount = false;
			return;
		}

	   	//console.log(this.symbol + "//checkIfHasDidAtLeastxCandlesAfterLineCross//" + this.candleCountsToWaitAfterLineCrossValue);
	   //	console.log(this.symbol + "//" + this.candleCountsToWaitAfterLineCross);
		if(series[series.length - 1][1].isFinal != false)
		{
			//console.log(this.symbol + "on candle close ---------------------------");
			var close = series[series.length - 1][1].close;
			var open = series[series.length - 1][1].open;
			
			// candle above line -- reset
			if(this.currentPrice > this.crossedPrice)
			{
				//console.log(this.symbol + "// reset above line//close price:",close);
				this.resetCycle();
				return;
			}
			// red candle
			else if(close < open)
			{				
				//console.log(this.symbol + "// red candle, close price:",close);
				this.candleCountsToWaitAfterLineCrossValue--;	    		
			}

			if(this.candleCountsToWaitAfterLineCrossValue <= 0)
			{						
				//console.log(this.symbol + "DT MODE");
				this.conditonPhase =  this.phases.WaitingDownTrend;
	    		this.downTrendBasePrice = this.currentPrice;
			}
		}
	}

	has_pullbackLimitReached(){
		if(this.pullBackRate >= this.pullBackLimitRate/100.0)
			return true;
		else
			return false;
	}

	// is the price reached the down trend %
	has_DownTrendLimitReached(){
		if(this.downTrendRate >= this.downTrendLimitRate/100.0)
			return true;
		else
			return false;
	}

	has_upTrendReachedPercentage(){		
		if(this.uptrend_rate >= this.uptrend_percentage/100.0)
			return true;
		else
			return false;
	}


	has_upTrendReachedPB(){		
		if(this.uptrendPB_rate >= this.uptrend_pb_percentage/100.0)
			return true;
		else
			return false;
	}

	has_upTrendReachedResistence(){
		if(this.currentPrice >= this.UpTrendBasePrice * (1.0 + this.UPTrendResistencePercentage/100.0))
		{
			return true;
		}
		else
			return false;
	}

	upTrendRepositionSupAndResistence(){
		var resistencePrice = this.UpTrendBasePrice * (1.0 + this.UPTrendResistencePercentage/100.0);
		this.UpTrendBasePrice = resistencePrice;
		this.updateSLPrice(this.UpTrendBasePrice * (1.0 - this.UPTrendSupportPercentage/100.0));
		this.updateTPPrice(this.UpTrendBasePrice * (1.0 + this.UPTrendResistencePercentage/100.0));
	}

	updateUpTrendRate()
	{
		if(this.UpTrendBasePrice != 0)
			this.uptrend_rate = Math.abs(this.UpTrendBasePrice - this.currentPrice)/this.UpTrendBasePrice;
		if(this.currentPrice < this.UpTrendBasePrice)
			this.uptrend_rate *= -1;
	}

	updateUpTrendPBRate()
	{
		if(this.UpTrendPullBackBasePrice != 0)
			this.uptrendPB_rate = Math.abs(this.UpTrendPullBackBasePrice - this.currentPrice)/this.UpTrendPullBackBasePrice;
		if(this.currentPrice > this.UpTrendPullBackBasePrice)
			this.UpTrendPullBackBasePrice  = 0;
	}

	// distance btw ema's in points
	updateEMAsDistance(series)
	{		
		if(this.tickSize != 0)
			this.emasDistance = Math.abs(this.longMA  - this.shortMA )/(this.tickSize * 10);
		//console.log(this.emasDistance , this.stepSize)
	}

	// update rate down trend
	updateDownTrendRate()
	{
		if(this.downTrendBasePrice != 0)
			this.downTrendRate = Math.abs(this.downTrendBasePrice - this.currentPrice)/this.downTrendBasePrice;
		if(this.currentPrice > this.downTrendBasePrice)
			this.downTrendRate *= -1;
		//console.clear();
		//console.log("downTrendBasePrice:",this.downTrendBasePrice);
		//console.log("downTrendRate:",this.downTrendRate/100.0);
		//console.log("downTrendLimitRate:",this.downTrendLimitRate);
	}

	updatePullBackRate()
	{
		if(this.pullbackBasePrice != 0)
			this.pullBackRate =  Math.abs(this.pullbackBasePrice - this.currentPrice)/this.pullbackBasePrice;
		if(this.currentPrice < this.pullbackBasePrice)
			this.pullBackRate *= -1;
	//console.clear();
	//	console.log("pullbackBasePrice:",this.pullbackBasePrice);
	//	console.log("pullBackRate:",this.pullBackRate/100.0);
	//	console.log("pullBackLimitRate:",this.pullBackLimitRate);
	}


	// update time frame
	updateTimeFrame(timeFrame)
	{
		this.timeFrame = timeFrame;
	}

	// updateMAType

	updateMAType(MAType)
	{
		this.MAType = MAType;
	}
	// update DT
	updateDownTrendLimitRate(rate)
	{
		this.downTrendLimitRate = rate * 1.0;
	}

	// update PB
	updatePullBackLimitRate(rate)
	{
		this.pullBackLimitRate = rate * 1.0;
	}

	updateOpenedPrice(price)
	{
		this.openedPrice = price * 1.0;
	}

	// update EMA
	updateEMAShort(period)
	{
		this.emaShortPeriod = period;
	}

	// update EMA
	updateEMALong(period)
	{
		this.emaLongPeriod = period;
	}
	
	// update lots
	updateLots(lots)
	{
		this.lots = Number(lots).toFixed(2);
	}

	// update lots
	updateUSDTAmount(usdt)
	{
		this.usdtAmount = usdt * 1.0;
	}

	// update SL
	updateSL(sl)
	{
		this.stopLoss = sl * 1.0;
		this.UPTrendSupportPercentage = sl;
	}
	//update Unexptected drop huascar
	updateUnexpectedDropPercentage(ud){
		this.unexpectedDropPercentage = ud * 1.0;
	}

	// update TP
	updateTP(tp)
	{
		this.takeProfit = tp * 1.0;
		this.UPTrendResistencePercentage = tp;
	}


	updateTickSize(size)
	{
		this.tickSize = size * 1.0;
	}

	updateStepSize(size)
	{		
		this.stepSize = size * 1.0;
	}

	updateBaseAsset(BA)
	{
		this.baseAsset = BA;
	}

	updateSLPrice(sl)
	{
		this.SLPrice = sl;
	}

	updateTPPrice(tp)
	{
		this.TPPrice = tp;
	}

	// check Stop Loss
	checkStopLoss()
	{
		//console.log("STOPLOSS:", this.openedPrice * (1.0 - this.stopLoss/100.0));
		if(this.stopLoss == 0 || this.openedPrice == 0) return false;
		if(this.currentPrice <= this.SLPrice)
		{
			return true;
		}
		return false;
	}

	checkTakeProfit()
	{
		//console.log("TP:", this.openedPrice * (1+this.takeProfit/100.0));
		if(this.takeProfit == 0 || this.openedPrice == 0) return false;
		if(this.currentPrice >= this.TPPrice)
		{
			return true;
		}
		return false;
	}

	checkTakeProfit50()
	{
		if(this.takeProfit == 0 || this.openedPrice == 0) return false;
		//Work here HUASCAR
		const TPPrice50 = (this.TPPrice+this.openedPrice)/2;
		if(this.currentPrice >= TPPrice50)
		{
			return true;
		}
		return false;
	}
	
	ema(series, period, offsetCandles = 0) {			
		var emaSum = this.sma(series,period,offsetCandles + period - 1);
		//var emaSum = series[series.length - 1 - period + 1][1].close * 1.0;
		var multiplier = 2.0/((period-1)+1.0);	
		
		for(var i = series.length - 1 - period + 1 - offsetCandles; i <= series.length - 1 - offsetCandles; i++) { 	
			var prevEma = emaSum;		
			emaSum = (series[i][1].close * 1.0 - prevEma) * multiplier + prevEma;						
			
		}
		
		return emaSum;
	}	

	// moving avarage
	sma(series, period, offsetCandles = 0) {
		var sum = 0.0;
		for (var i = series.length - 1 - offsetCandles; i > series.length - 1 - offsetCandles - period; i--) { 
	    	sum += series[i][1].close/period;	    	
		}	 		
		return sum;
	}

	updateConditionsPhaseName()
	{
		switch(this.conditonPhase)
		{
			case 1: this.conditonPhaseName = "Off";                                        break;
			case 2: this.conditonPhaseName = "waiting MA cross";                           break;
			case 3: this.conditonPhaseName = "waiting DT %";                               break;
			case 4: this.conditonPhaseName = "waiting PB %";                               break;
			case 5: this.conditonPhaseName = "trying to buy";                              break;
			case 6: this.conditonPhaseName = "waiting to SL or TP";                        break;
			case 7: this.conditonPhaseName = "";                                           break;
			case 8: this.conditonPhaseName = "";                                           break;
			case 9: this.conditonPhaseName =  "trying to sell (SL)";                       break;
			case 10: this.conditonPhaseName = "trying to sell (TP)";                       break;
			case 11: this.conditonPhaseName = "Wait n candles, possible DT else reset";    break;	
			case 12: this.conditonPhaseName = "UP Trend";                                  break;	
			case 13: this.conditonPhaseName = "deciding";                                  break;	
			case 14: this.conditonPhaseName = "if TP, UPtrend else SL";                    break;			
			case 15: this.conditonPhaseName = "Top of UT - wait PB or keep growing";                              break;		
			case 16: this.conditonPhaseName = "Candle Count (" + (this.candleCountsToWaitAfterLineCrossValue)+ ")"; break;
			case 17: this.conditonPhaseName = "wait to buy or reset PB ";                   break;	
			case 19: this.conditonPhaseName = "trading";                   break;		
			case 20: this.conditonPhaseName = "wait to sell or return to top of UT ";         break;	
			case 21: this.conditonPhaseName = "Keep growing";         break;			
		}
	}

	resetAttempts()
	{
		this.attempts = 0;
	}

	addAttempts()
	{
		this.attempts += 1;
	}

	swapRobotMode()
	{
		if (this.isActived == true)
			this.isActived = false;
		else
			this.isActived = true;
	}

	swapRobotUpTrendMode()
	{
		if (this.uptrend_on == true)
			this.uptrend_on = false;
		else
			this.uptrend_on = true;
	}

	swapRobotXCandlesWaitMode()
	{
		if (this.xCandlesWait_on == true)
			this.xCandlesWait_on = false;
		else
			this.xCandlesWait_on = true;
	}

	reset()
	{
		this.resetCycle();
		this.isActived = false;
		this.onStart = true;
		this.conditonPhase = this.phases.Off;
		this.onCrossed = false;
		this.bidPrice = 0.0;
		this.askPrice = 0.0;
		this.downTrendRate = 0.0; // current
		this.pullBackRate = 0.0; // current
		this.openedPrice = 0.0;
	}

	resetCycle()
	{
		this.onStart = true;
		this.conditonPhase = this.phases.Off;
		this.onCrossed = false;
		this.downTrendRate = 0.0; // current
		this.pullBackRate = 0.0; // current		
		this.resetAttempts();
		this.openedPrice = 0;
		this.shortMA = 0;
		this.longMA = 0;
		this.SLPrice = 0;
		this.TPPrice = 0;	
		this.uptrend_rate = 0;
		this.uptrendPB_rate = 0;	
		this.candleCountsToWaitAfterLineCrossValue = this.candleCountsToWaitAfterLineCross;
		this.w8ToBuy_UP_rate = 0;
		this.w8ToBuy_DOWN_rate = 0;
		this.w8ToSell_UP_rate = 0;
		this.w8ToSell_DOWN_rate = 0;
		this.timerBUY = 0;
		this.timerSELL = 0;
	}

	update()
	{

	}
}