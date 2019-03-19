module.exports = class Robot{
	constructor(binance){
		this.binance = binance;
	    this.phases = {"Off":1, "WaitingMACross":2, "WaitingDownTrend":3, "WaitingPullbackOrPriceDrop" :4,"Buying" : 5, "WaitingTPOrSL": 6};
	    
		this.symbol = "BTCUSDT";
		this.bidPrice = 0.0;
		this.askPrice = 0.0;
		this.timeFrame = "1m";
		this.downTrendRate = 0.0; // current
		this.downTrendLimitRate = 1.0;
		this.pullBackRate = 0.0; // current
		this.pullBackLimitRate = 0.5;
		this.emasDistance = 0;
		this.lots = 0.0; // USDT
		this.usdtAmount = 1.0; 
		this.positionType = "-";
		this.openedPrice = 0.0;
		this.stopLoss = 0.0;
		this.takeProfit = 0.0;
		this.tickSize = 0.0;
		this.conditonPhaseName = "Off";
		this.emaShortPeriod = 8;
		this.emaLongPeriod = 21;	
		this.isActived = false;
		this.MAType = "smooth";
		// price em EMA short cross EMA long
		this.crossedPrice = 0;		
		// time crossed
		this.timeCrossed = 0;
		// price above crossedPrice
		this.downTrendBasePrice = 0;
		this.pullbackBasePrice = 0;
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
	}

	has_EMAShort_Crossed_EMALong(series){
		// current sma
		var longCurSMA = this.sma(series,this.emaLongPeriod);
		var shotCurSMA = this.sma(series,this.emaShortPeriod);
		// previous sma candle current + 2
		var longPrevSMA = this.sma(series,this.emaLongPeriod, 1);
		var shotPrevSMA = this.sma(series,this.emaShortPeriod, 1);
		//
		var longPrev2SMA = this.sma(series,this.emaLongPeriod, 2);
		var shotPrev2SMA = this.sma(series,this.emaShortPeriod, 2);	
		if((shotPrev2SMA > longPrev2SMA || shotPrevSMA >= longPrevSMA) && shotCurSMA <= longCurSMA && series[series.length - 1][1].isFinal != false)
			return true;
		else
			return false;
	}

	// is the price reached the down trend %
	has_DownTrendLimitReached(){
		if(this.downTrendRate >= this.downTrendLimitRate)
			return true;
		else
			return false;
	}

	has_pullbackLimitReached(){
		if(this.pullBackRate >= this.pullBackLimitRate)
			return true;
		else
			return false;
	}

	// distance btw ema's in points
	updateEMAsDistance(series)
	{
		var longCurSMA = this.sma(series,this.emaLongPeriod);
		var shotCurSMA = this.sma(series,this.emaShortPeriod);
		this.emasDistance = Math.abs(longCurSMA - shotCurSMA)/(this.tickSize * 10);
		//console.log(this.emasDistance , this.stepSize)
	}

	// update rate down trend
	updateDownTrendRate()
	{
		if(this.downTrendBasePrice != 0)
			this.downTrendRate =  Math.abs(this.downTrendBasePrice - this.currentPrice)/this.downTrendBasePrice;
		if(this.currentPrice > this.downTrendBasePrice)
			this.downTrendRate *= -1;
	}

	updatePullBackRate()
	{
		if(this.pullbackBasePrice != 0)
			this.pullBackRate =  Math.abs(this.pullbackBasePrice - this.currentPrice)/this.pullbackBasePrice;
		if(this.currentPrice < this.pullbackBasePrice)
			this.pullBackRate *= -1;
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
		this.openedPrice = price;
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
		this.lots = lots;
	}

	// update lots
	updateUSDTAmount(usdt)
	{
		this.usdtAmount = usdt;
	}

	// update SL
	updateSL(sl)
	{
		this.stopLoss = sl * 1.0;
	}

	// update TP
	updateTP(tp)
	{
		this.takeProfit = tp * 1.0;
	}


	updateTickSize(size)
	{
		this.tickSize = size;
	}

	updateBaseAsset(BA)
	{
		this.baseAsset = BA;
	}

	// check Stop Loss
	checkStopLoss()
	{
		//console.log("STOPLOSS:", this.openedPrice * (1.0 - this.stopLoss/100.0));
		if(this.stopLoss == 0 || this.openedPrice == 0) return false;
		if(this.currentPrice <= (this.openedPrice * (1.0 - this.stopLoss/100.0)))
		{
			this.binance.marketSell(this.symbol, this.lots);
			return true;
		}
		return false;
	}

	checkTakeProfit()
	{
		//console.log("TP:", this.openedPrice * (1+this.takeProfit/100.0));
		if(this.takeProfit == 0 || this.openedPrice == 0) return false;
		if(this.currentPrice >= (this.openedPrice * (1+this.takeProfit/100.0)))
		{
			this.binance.marketSell(this.symbol, this.lots);
			return true;
		}
		return false;
	}

	// moving avarage
	sma(series, period, offsetCandles = 0) {
		var sum = 0.0;
		for (var i = series.length - 1 - offsetCandles; i > series.length - 1 - period - offsetCandles; i--) { 
	    	sum += series[i][1].close/period;
		}	 
		return sum;
	}

	ema(series, period, offsetCandles = 0) {
	//	var multiplier = 2/(period+1);

	//(series[i][1].close - ema(series) * multiplier + 

		//var sum = 0.0;
		//for (var i = series.length - 1 - offsetCandles; i > series.length - 1 - period - offsetCandles; i--) { 
	   // 	sum += series[i][1].close/period;
		//}	 
		//return sum;
	}

	updateConditionsPhaseName()
	{
		switch(this.conditonPhase)
		{
			case 1: this.conditonPhaseName = "Off";                                        break;
			case 2: this.conditonPhaseName = "waiting EMA cross";                          break;
			case 3: this.conditonPhaseName = "waiting down trend %";                       break;
			case 4: this.conditonPhaseName = "waiting pullback % or price drop again";     break;
			case 5: this.conditonPhaseName = "buying";                                     break;
			case 6: this.conditonPhaseName = "waiting to SL or buy";                       break;
		}
	}

	swapRobotMode()
	{
		if (this.isActived == true)
			this.isActived = false;
		else
			this.isActived = true;
	}

	reset()
	{
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
	}
}