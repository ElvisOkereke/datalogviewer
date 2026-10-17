import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'csv_cubit.dart';
import 'csv_table.dart';
import 'file_picker.dart';
import 'csv_parser.dart';
import 'csv_line_chart.dart';

void main() {
  runApp(MyApp());
}

class MyApp extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    //make sure provider scope is encompassing this widget tree not just the MaterialApp
    return BlocProvider(
      create: (context) => CsvCubit(), // ← create/init your state model
      child: MaterialApp(home: CsvHomePage()),
    );
  }
}

class CsvHomePage extends StatefulWidget {
  @override
  _CsvHomePageState createState() => _CsvHomePageState();
}

class _CsvHomePageState extends State<CsvHomePage> {
  int _numberOfCharts = 1;
  double _startValue = 0.0;
  double _endValue = 15.0;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('DataLogViewer'),
        toolbarHeight: 64,
        backgroundColor: const Color.fromARGB(255, 38, 44, 48),
        titleTextStyle: const TextStyle(
            fontSize: 24,
            fontWeight: FontWeight.bold,
            color: Color.fromARGB(255, 247, 171, 10)),
        actions: [
          IconButton(
            icon: const Icon(Icons.upload_file),
            onPressed: () async {
              final path = await pickFile();
              if (path != null) {
                try {
                  final data = await parseCsv(path);
                  context.read<CsvCubit>().loadCsvData(data);
                } catch (e) {
                  _showErrorDialog(context, e.toString());
                }
              }
            },
            tooltip: 'Load CSV',
            color: const Color.fromARGB(255, 247, 171, 10),
          ),
          IconButton(
            icon: const Icon(Icons.table_chart),
            onPressed: () {
              showDialog(
                context: context,
                builder: (BuildContext context) {
                  return AlertDialog(
                    backgroundColor: const Color.fromARGB(0, 38, 44, 48),
                    contentPadding: EdgeInsets.zero,
                    content: SizedBox(
                      width: MediaQuery.of(context).size.width * 0.9,
                      height: MediaQuery.of(context).size.height * 0.75,
                      child: CsvTable(),
                    ),
                  );
                },
              );
            },
            tooltip: 'Show Table',
            color: const Color.fromARGB(255, 247, 171, 10),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16.0),
            child: DropdownButton<int>(
              style: const TextStyle(
                color: Colors.white,
              ),
              value: _numberOfCharts,
              dropdownColor: const Color.fromARGB(255, 175, 122, 8),
              iconEnabledColor: const Color.fromARGB(255, 247, 171, 10),
              onChanged: (int? newValue) {
                setState(() {
                  _numberOfCharts = newValue!;
                });
              },
              items: <int>[1, 2, 3, 4].map<DropdownMenuItem<int>>((int value) {
                return DropdownMenuItem<int>(
                  value: value,
                  child: Text('$value Chart${value > 1 ? 's' : ''}'),
                );
              }).toList(),
            ),
          ),
        ],
      ),
      body: Container(
        color: const Color.fromARGB(255, 59, 73, 80),
        child: LayoutBuilder(
          builder: (context, constraints) {
            return Padding(
              padding: const EdgeInsets.all(16.0),
              child: Column(
                children: [
                  RangeSlider(
                    min: 0.0,
                    max: 100.0,
                    values: RangeValues(_startValue, _endValue),
                    onChanged: (values) {
                      setState(() {
                        _startValue = values.start;
                        _endValue = values.end;
                      });
                    },
                  ),
                  const SizedBox(height: 16),
                  Expanded(
                    flex: 2,
                    child: ListView.builder(
                      itemCount: _numberOfCharts,
                      itemBuilder: (context, index) {
                        return Padding(
                          padding: const EdgeInsets.symmetric(vertical: 8.0),
                          child: SizedBox(
                            //height: 200, // Set a fixed height for each chart
                            child: CsvLineChart(
                              multiplier: (_endValue - _startValue) / 100,
                            ),
                          ),
                        );
                      },
                    ),
                  ),
                ],
              ),
            );
          },
        ),
      ),
    );
  }

  void _showErrorDialog(BuildContext context, String errorMessage) {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          title: const Text('Error'),
          content: Text(errorMessage),
          actions: [
            TextButton(
              child: const Text('OK'),
              onPressed: () {
                Navigator.of(context).pop();
              },
            ),
          ],
        );
      },
    );
  }
}
