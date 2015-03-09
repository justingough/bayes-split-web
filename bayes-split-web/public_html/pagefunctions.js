/* 
Requires: google visualisaiton library, jStat, and various HTML elements are assumed - as shown in the example HTML

(c) 2015  Justin Gough   justin@peakconversion.com

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated 
documentation files (the "Software"), to deal in the Software without restriction, including without limitation 
the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, 
and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions 
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
 TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL 
 THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF 
 CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER 
 DEALINGS IN THE SOFTWARE.
 */

google.load("visualization", "1", {packages:["corechart"]});

var aBayes = function(){
    var numRows = 4
    ,prior = {a:0.5,b:0.5} //Jefferys prior
    //uninformative priors, {a:1,b:1} is flat, {a:0.5,b:0.5} is the Jefferys prior, see http://www.cs.berkeley.edu/~jordan/courses/260-spring10/lectures/lecture7.pdf
    //could add code to collect an infromative prior from the form if it is felt to be available   
    ,default_POINTS_TO_PLOT = 2000
    ,default_SAMPLES_FOR_COMPARE = 5000;
     
    function clearResults(){
        /* expected naming in HTML is 
         * p# is the cell for probability
         * r# is the cell for credible interval
         */
        var placeholder;
        for (var i=0;i<numRows;i++){
            placeholder = (document.forms["TestResults"]["i" + i.toString()].checked === true)?"calculating":"&nbsp;";
            document.getElementById("p" + i.toString()).innerHTML = placeholder;
            document.getElementById("r" + i.toString()).innerHTML = placeholder;
        }
    }
    
    function plotButton(){
        sendGAevent('button','click','calculate');
        plotGraph();
    };

    function plotGraph(){
        //do the calculations
        clearResults();
        window.setTimeout(doCalcs, 1);
    };
    
    function sendGAevent(category, action, label, value){
        var valueClean; 
        if (typeof value !=='undefined'){
            if (!isNaN(value)) valueClean = parseInt(value);
         }
         if (typeof google_tag_manager === 'object'){
            if (typeof dataLayer === 'undefined') dataLayer = [];//does not handle situation where dataLayer has a different name
            dataLayer.push({'event': 'gaEvent', 'eventCategory': category, 'eventAction':action, 'eventLabel':label,'eventValue':valueClean });
         }
         else {
            if (typeof ga === 'function') ga('send', category, action, label, valueClean);
            if (typeof _gaq === 'object') _gaq.push([ '_trackEvent', category, action, label, valueClean ]);
        }
    }
    function zoomButton(){
        sendGAevent('button','click','zoom');
        //aBayes.zoomgraph();
        window.setTimeout(zoomGraph, 1);
    };
    
    function zoomGraph(){
        var distros =  setupDistros()
        ,maxAvg = 0
        ,minVal, maxVal
        ,distBest = 0
        ,values
        , dontChart = false;
        //pick the distro with the highest expectation value
        for (var j=0;j<numRows;j++){
           if (distros[j]){
             if (distros[j].dist.mean()>maxAvg){
                maxAvg = distros[j].dist.mean();
                distBest = j;
             }
           }
        }
        //we're going to plot 3 SDs eihter side of the expectation
        minVal = maxAvg - (3 * Math.sqrt(distros[distBest].dist.variance()));
        maxVal = maxAvg + (3 * Math.sqrt(distros[distBest].dist.variance()));
        //unless the 3 SDs are outside the bounds
        minVal = (minVal<0)?0:minVal;
        maxVal = (maxVal>1)?1:maxVal;
        
        values = setupData(distros,default_POINTS_TO_PLOT,minVal, maxVal );

        for (var j=0;j<numRows;j++){
           if (distros[j]){
             if (distros[j].dontGraph){
                dontChart = true;
             }
           }
        }
        if (dontChart){
           document.getElementById('plot').innerHTML = "<p>Distribution for one or more versions could not be charted - probably due to difficulties calculating for very high numbers of trials.</p>";
        }
        else
           {
           drawChart(values, distros);
        }
        calcProbs(distros,default_SAMPLES_FOR_COMPARE);
    };
    
    function doCalcs(){
        var distros =  setupDistros(), values = setupData(distros), dontChart = false;
        for (var j=0;j<numRows;j++){
           if (distros[j]){
             if (distros[j].dontGraph){
                dontChart = true;
             }
           }
        }
        if (dontChart){
           document.getElementById('plot').innerHTML = "<p>Distribution for one or more versions could not be charted - probably due to difficulties calculating for very high numbers of trials.</p>";
        }
        else
           {
           drawChart(values, distros);
        }
        calcProbs(distros,default_SAMPLES_FOR_COMPARE);
    };
    
    function zeroArray(length) {
        var arr = [], i = length;
        while (i--) {
            arr[i] = 0;
        }
        return arr;
    }
    
    function calcProbs(distros, numSamples) {
        var x,msg,winnerIndex, winnerValue, 
         winCount = zeroArray(numRows),
         numSamples = numSamples||1000;   
        for (var i=0;i<numSamples;i++){
           //for each sample, gets jStat to generate a sample and compares to current winner
           winnerValue = 0; 
           for (var j=0;j<numRows;j++){
              if (distros[j]){
                x = distros[j].dist.sample();
                if (x>winnerValue){
                   winnerIndex = j;
                   winnerValue = x;
                }
              }
           }
           winCount[winnerIndex]++;
        }
        
        //put the probablities of being the best, and the credible intervals in the table
        for (i=0;i<numRows;i++){
           if (distros[i]){
               msg = Math.round(distros[i].low95 *1000)/10 + "% and " + Math.round(distros[i].high95 *1000)/10 +"%";
               document.getElementById("p" + i.toString()).innerHTML = Math.round(winCount[i]/(numSamples/100)) + "%";
               document.getElementById("r" + i.toString()).innerHTML = msg;
           }else{
               document.getElementById("p" + i.toString()).innerHTML = "&nbsp;";
           }
        }
    };

    function setupData(distros, numPoints, minX, maxX) {
        //get a set of points for plotting the distros
        
        var xLabel, xValue, xValueForPlot, data = [], dataRow = [], pdfValue, rangeSize;
        
        //if the y values are not specified, default to 0 through 1, the full range of the beta function
        minX = minX||0;
        maxX = maxX||1;

        for (var j=0;j<numRows;j++){  //steping through the rows corresponding to branches of the test
            if (distros[j]){
               distros[j].dontGraph = false;
               if (distros[j].numSuccesses===0) distros[j].low95 =0;
               if (distros[j].numFailures===0) distros[j].high95 = 1;
            }
        }
        
        numPoints = numPoints||default_POINTS_TO_PLOT;
        rangeSize = maxX-minX;
        for (var i=0;i<=numPoints+1;i++){
            //xValue is  moving along the x axis evenly accross the entire range of the Bta (ie 0 to 1)
            xValue =  (i/numPoints);
            //xValueForPlot is  moving along the x axis evenly accross the specified range
            xValueForPlot = minX + (rangeSize * xValue);
            
            xLabel = 100 * (xValueForPlot);//we're labeling the points with percentages (x axis corresponds to conversion rate)
            
            dataRow = [xLabel];
            for (var j=0;j<numRows;j++){
                if (distros[j]){
                   pdfValue = distros[j].dist.pdf(xValueForPlot);
                   if (isNaN(pdfValue)){
                       //we've got no value for the pdf at this point. 
                      distros[j].dontGraph = true;
                      dataRow.push(0);
                   }
                   else {
                      dataRow.push(pdfValue);
                   }

                   if ((!distros[j].low95)&& !(distros[j].low95===0)){
                      if (distros[j].dist.cdf(xValue)>0.025){
                         distros[j].low95 = xValue - (1/numPoints) ;
                      }
                   }
                   if (!distros[j].high95){
                      if (distros[j].dist.cdf(xValue)>0.975){
                         distros[j].high95 = xValue;
                      }
                   }
                }
            }
            data.push(dataRow);
        }
        return data;
    };

    function setupDistros() {
        /*
        * distros is an array of distributions, each having the
        * following properties
        *  dist - the jStat distribtion object
        *  label
        *  numSuccesses - effectively the A parameter
        *  numFailures - effectively the B parameter
        * Additionally, the below are calculated in the setupData function
        *  data - an array of [x,y] arrays for plotting
        *  low95 - the lower edge of the 95% credible interval centred on the mean
        *  high95 - the upper edge of the 95% credible interval centred on the mean
        */ 
        var distros = [];
        var numTrials, numSuccesses, numFailures, timeWarning;
        var mainForm = document.forms["TestResults"];
        var thisDistro = {};
        for (var i=0;i<numRows;i++){
           if (mainForm["i" + i.toString()].checked === true){
             thisDistro = {};
             numTrials = parseInt(mainForm["n" + i.toString()].value);
             numSuccesses = parseInt(mainForm["s" + i.toString()].value);
             numFailures = numTrials - numSuccesses;
             if (isNaN(numTrials) || isNaN(numSuccesses)) {
                window.alert("All values must be integers.");
                return false;
               }
               if ((numSuccesses > numTrials)) {
                window.alert("You have a row with more successes than trials.");
                return false;
               }

               if (numTrials>=0){
                  thisDistro.dist = jStat.beta(numSuccesses+prior.a,numFailures+prior.b);
                  thisDistro.numSuccesses = numSuccesses;
                  thisDistro.numFailures = numFailures;
                  thisDistro.label = document.getElementById("l"+i).innerHTML;
                  distros[i] = thisDistro;
               }
           }
        };
        return distros;
    };
    
    function drawChart(values, distros) {
        var data = new google.visualization.DataTable();
        data.addColumn('number', 'Conversion');
        for (var i=0;i<numRows;i++){
            if (distros[i]){
               data.addColumn('number', distros[i].label);
            }
        }
        data.addRows(values);
        var options = {
          hAxis: {title: 'Conversion Rate (%)',  titleTextStyle: {color: 'black'}, gridlines:{count: 10}},
          vAxis: {title: 'Probability density',  titleTextStyle: {color: 'black'}},
        chartArea: {left:20,top:0,width:"70%",height:"90%"},
        enableInteractivity: false
        };

        var chart = new google.visualization.AreaChart(document.getElementById('plot'));
        chart.draw(data, options);
    };
        
            
    return {
        plotGraph:plotGraph,
        plotButton:plotButton,
        zoomButton:zoomButton
    };
    
    
}();