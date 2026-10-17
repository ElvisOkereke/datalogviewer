import 'dart:math';

import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'csv_cubit.dart';
import 'normilize.dart';

class CsvLineChart extends StatefulWidget {
  @override
  _CsvLineChartState createState() =>
      _CsvLineChartState(multiplier: multiplier);

  double multiplier = 0.0;

  CsvLineChart({required this.multiplier});
}
//Features to add:
//1. Calculated Fields
//2. add cursor to chart
//3. add settings menu(normalize, show dots)
//4. global maxvisiblepoints slider for all charts

class _CsvLineChartState extends State<CsvLineChart>
    with AutomaticKeepAliveClientMixin {
  _CsvLineChartState({required this.multiplier});

  //automatic keep alive mixin, added to prevent extra charts from resetting
  List<int?> selectedVariables =
      List.filled(5, null); // Default selected variables to None
  final List<Color> _lineColors = [
    const Color.fromARGB(255, 255, 0, 0), // Bright Red
    const Color.fromARGB(255, 0, 255, 0), // Bright Green
    const Color.fromARGB(255, 0, 255, 255), // Bright Cyan
    const Color.fromARGB(255, 255, 255, 0), // Bright Yellow
    const Color.fromARGB(255, 255, 0, 255), // Bright Magenta
  ];

  double multiplier = 0.0;
  double _sliderValue = 0.0;
  List<Widget> chartWidgets = [];
  List<Widget> chartWidgetsMin = [];
  List<Widget> chartWidgetsMax = [];
  double pointerValue = 0.0;
  bool normalize = true;

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<CsvCubit, List<List<dynamic>>>(
      builder: (
        context,
        data,
      ) {
        // Calculate minY and maxY based on the selected variables
        List<double> minY = List.filled(data.length, double.infinity);
        List<double> maxY = List.filled(data.length, double.negativeInfinity);

        if (data.isEmpty) {
          return const Center(
              child: Text('No data loaded',
                  style: TextStyle(color: Colors.white)));
        }
        if (pointerValue == 0.0 || pointerValue == data[2][5].toDouble()) {
          //check if user uploaded new data then resets the chart to the beginning
          pointerValue = double.tryParse(data[2][5].toString()) ?? 0.0;

          for (int? variableIndex in selectedVariables) {
            if (variableIndex != null) {
              for (int j = 0; j < data[j].length; j++) {
                for (int i = 0; i < data.length; i++) {
                  double value = double.tryParse(data[i][j].toString()) ?? 0;

                  if (value < minY[j]) minY[j] = value;
                  if (value > maxY[j]) maxY[j] = value;
                  if (minY[j] == double.infinity ||
                      maxY[j] == double.negativeInfinity) {
                    minY[j] = 0;
                    maxY[j] = 1;
                  }
                }
              }
            }
          }
        } else {
          selectedVariables = List.filled(5, null);
          pointerValue = double.tryParse(data[2][5].toString()) ?? 0.0;
          _sliderValue = 0.0;
        }

        int maxPoints = data.length - 1;
        double maxVisiblePoints = max(maxPoints * multiplier,
            25); //max visible points on the chart 15% of the data length or 25 points

        List<LineChartBarData> finalData = _getLineChartBarData(
            data, _sliderValue, maxVisiblePoints, minY, maxY);

        chartWidgets = [
          //displays the value of the data at the cursor
          ...selectedVariables.map((variableIndex) {
            if (variableIndex == null) return Container();
            double value = double.tryParse(
                    data[_sliderValue.toInt()][variableIndex].toString()) ??
                0;
            return Text(
              '${data[0][variableIndex]}: $value',
              style: TextStyle(
                  fontSize: 14,
                  color: _lineColors[selectedVariables.indexOf(
                      variableIndex)]), //chooses color based on color of the respective data line
            );
          })
        ];

        chartWidgetsMax = [
          //displays the max value of the data fields selected
          ...selectedVariables.map((variableIndex) {
            if (variableIndex == null) return Container();
            double value = double.tryParse(maxY[variableIndex].toString()) ?? 0;
            return Text(
              '${data[0][variableIndex]}, max: $value',
              style: TextStyle(
                  fontSize: 14,
                  color: _lineColors[selectedVariables.indexOf(
                      variableIndex)]), //chooses color based on color of the respective data line
            );
          })
        ];
        chartWidgetsMin = [
          //displays the min value of the data fields selected
          ...selectedVariables.map((variableIndex) {
            if (variableIndex == null) return Container();
            double value = double.tryParse(minY[variableIndex].toString()) ?? 0;
            return Text(
              '${data[0][variableIndex]}, min: $value',
              style: TextStyle(
                  fontSize: 14,
                  color: _lineColors[selectedVariables.indexOf(
                      variableIndex)]), //chooses color based on color of the respective data line
            );
          })
        ];

        return Stack(
          children: [
            Column(
              children: [
                Row(
                  children: [
                    Column(
                      children: List.generate(5, (index) {
                        return SizedBox(
                            width: 210,
                            child: DropdownButton<int?>(
                              //dropdown menu for selecting data fields
                              dropdownColor:
                                  const Color.fromARGB(255, 175, 122, 8),
                              style: const TextStyle(color: Colors.white),
                              value: selectedVariables[index],
                              items: [
                                const DropdownMenuItem<int?>(
                                  value: null,
                                  child: Text('None'),
                                ),
                                ...List.generate(
                                  data.first.length - 1,
                                  (i) => DropdownMenuItem<int?>(
                                    value: i + 1,
                                    child: Text(data[0][i + 1].toString()),
                                  ),
                                ),
                              ],
                              onChanged: (int? newValue) {
                                setState(() {
                                  selectedVariables[index] = newValue;
                                });
                              },
                            ));
                      }),
                    ),
                    Expanded(
                      child: GestureDetector(
                        //gesture detector for the  shifting chart
                        onTapUp: (details) {
                          double halfWidth =
                              MediaQuery.of(context).size.width / 2;
                          if (details.localPosition.dx > halfWidth) {
                            //print('${_sliderValue},slider');
                            //print('${maxVisiblePoints},maxVisiblePoints');
                            //print('${maxPoints},maxPoints');
                            if (maxPoints.toDouble() -
                                    maxVisiblePoints.floor() >=
                                _sliderValue) {
                              setState(() {
                                _sliderValue = min(
                                    _sliderValue + 10,
                                    maxPoints.toDouble() -
                                        maxVisiblePoints.floor());
                              });
                            }
                          } else {
                            setState(() {
                              _sliderValue = max(_sliderValue - 10, 0);
                            });
                          }
                        },
                        child: Padding(
                          padding: const EdgeInsets.only(left: 16.0),
                          child: Container(
                            width: (maxPoints
                                .toDouble()), // Adjust the width based on the data length
                            height: 400, // Set a fixed height for the chart
                            color:
                                Colors.black, // Set background color to black
                            child: LineChart(
                              LineChartData(
                                backgroundColor: Colors
                                    .black, // Set the background color of the chart
                                titlesData: FlTitlesData(
                                  leftTitles: SideTitles(
                                    showTitles: true,
                                    //add getTextStyle to see y axis values
                                  ),
                                  bottomTitles: SideTitles(
                                    showTitles: true,
                                    getTextStyles: (value) => const TextStyle(
                                        color: Colors.white, fontSize: 10),
                                  ),
                                ),
                                gridData: FlGridData(
                                  show: false, // Disable grid lines
                                ),
                                lineBarsData: finalData,
                                borderData: FlBorderData(
                                  show: false,
                                  border:
                                      Border.all(color: Colors.grey, width: 1),
                                ),
                                minX: _sliderValue,
                                maxX: _sliderValue + maxVisiblePoints,
                                //minY: -1,
                                //maxY: 1,
                                lineTouchData: LineTouchData(
                                  enabled: false, // Disable touch events
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
            Positioned(
              top: 0,
              right: 0,
              child: Container(
                color: Colors.transparent,
                padding: const EdgeInsets.all(8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: chartWidgets,
                ),
              ),
            ),
            Positioned(
              top: 0,
              left: 235,
              child: Container(
                color: Colors.transparent,
                padding: const EdgeInsets.all(8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: chartWidgetsMax,
                ),
              ),
            ),
            Positioned(
              bottom: 15,
              left: 235,
              child: Container(
                color: Colors.transparent,
                padding: const EdgeInsets.all(8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: chartWidgetsMin,
                ),
              ),
            ),
          ],
        );
      },
    );
  }

  List<LineChartBarData> _getLineChartBarData(
      List<List<dynamic>> data,
      double start,
      double maxVisiblePoints,
      List<double> minY,
      List<double> maxY) {
    List<LineChartBarData> lineBars = [];

    for (int i = 0; i < selectedVariables.length; i++) {
      int? variableIndex = selectedVariables[i];
      if (variableIndex == null) {
        continue; // Skip if 'None' is selected
      }
      List<FlSpot> spots = [];
      for (int j = start.toInt();
          j < start.toInt() + maxVisiblePoints.ceil() && j < data.length;
          j++) {
        if (normalize == true) {
          spots.add(FlSpot(
            //key,value
            j.toDouble(),
            normalizeData(
                double.tryParse(data[j][variableIndex].toString()) ?? 0,
                minY[variableIndex],
                maxY[
                    variableIndex]), //check if data element is a double, if not (meaning it a label or string) set it to 0, then normilize
          ));
        } else {
          spots.add(FlSpot(
            //key,value
            j.toDouble(),
            double.tryParse(data[j][variableIndex].toString()) ?? 0,
          ));
        }
        ;
      }

      lineBars.add(
        LineChartBarData(
          spots: spots,
          isCurved: false, // Set to false to make the lines straight
          barWidth: 2,
          dotData: FlDotData(show: true), //ADD SETTINGS TO ENABLE/DISABLE DOTS
          colors: [_lineColors[i]],
          belowBarData: BarAreaData(show: false),
        ),
      );
    }

    return lineBars;
  }

  @override
  bool get wantKeepAlive => true;
}
