/*
 * EarthStation v0.3
 * (c) 2013 Shashwat Kandadai and UCSC
 * https://github.com/shashwatak/EarthStation
 * License: MIT
 */

function UICtrl($scope, ThreeJS, WorkerManager, Motors, Radios) {
  // First, get the satellites we kept in local storage.
  var storage = chrome.storage.local;
  storage.get(null,function(result){
    $scope.$apply(function(){
      if (result){
        $scope.sat_table = result;
      }
      else{
        $scope.sat_table = {};
      };
    });
  });

  $scope.sidebar_selected = false;
  $scope.sidebar_clicked = function(){
    console.log("clickety: " + $scope.sidebar_selected);
    $scope.sidebar_selected = !$scope.sidebar_selected;
  };

  ThreeJS.init();
  ThreeJS.start_animation();

  WorkerManager.register_command_callback("tles_update", import_callback);
  function import_callback (data) {
    var sat_item = data.sat_item;
    var satnum = sat_item.satnum;
    if (!$scope.sat_table[satnum]){
      $scope.$apply(function(){
        $scope.sat_table[satnum] = sat_item;
        $scope.sat_table[satnum]["uplink_frequency"] = 450000000;
        $scope.sat_table[satnum]["downlink_frequency"] = 145000000;
      });
      storage.set($scope.sat_table);
    };
  };

  WorkerManager.register_command_callback("live_update", live_update_callback);
  function live_update_callback (data) {
    // When the WorkerManager service updates the satellite data,
    // it callbacks the controller to update the model here.
    var sat_item = data.sat_item;
    var satnum = sat_item.satnum;
    if ($scope.sat_table[satnum]){
      $scope.$apply(function() {
        // I apply these right away because I want these to refresh in the UI.
        $scope.sat_table[satnum]["look_angles"] = sat_item.look_angles;
        $scope.sat_table[satnum]["position_ecf"] = sat_item.position_ecf;
        $scope.sat_table[satnum]["position_eci"] = sat_item.position_eci;
        $scope.sat_table[satnum]["position_gd"] = sat_item.position_gd;
        $scope.sat_table[satnum]["doppler_factor"] = sat_item.doppler_factor;
        $scope.current_time = sat_item.time;
      });
    };
  };

  $scope.observer_longitude = -118.44833;
  $scope.observer_latitude = 34.307;
  $scope.observer_altitude = 0.37;

  ThreeJS.set_observer_location($scope.observer_longitude, $scope.observer_latitude, $scope.observer_altitude);
  WorkerManager.set_observer_location($scope.observer_longitude, $scope.observer_latitude, $scope.observer_altitude);

  $scope.clear_sats = function (){
    deselect_all_sats();
    $scope.sat_table = {};
    storage.clear();
  };

  var is_fullscreen = false;
  $scope.fullscreen = function () {
    if (!is_fullscreen){
      is_fullscreen = true;
      document.body.webkitRequestFullscreen();
    }
    else {
      is_fullscreen = false;
      document.webkitCancelFullScreen();
    };
  };
  var selected_sats = {};
  $scope.num_active_sats = 0;
  $scope.sat_item_clicked = function (satnum, sat) {
    if (!sat.selected) {
      select_sat (satnum, sat);
    }
    else {
      deselect_sat(satnum, sat);
    };
  };

  function select_sat (satnum, sat){
    ThreeJS.add_satellite(satnum, sat.satrec);
    sat.selected = true;
    selected_sats[satnum] = sat;
    $scope.num_active_sats++;
  };

  function deselect_sat (satnum, sat){
    ThreeJS.remove_satellite(satnum);
    sat.selected = false;
    selected_sats[satnum] = undefined;
    $scope.num_active_sats--;
  };

  function deselect_all_sats (){
    for (var satnum in selected_sats){
      if (selected_sats.hasOwnProperty(satnum) && selected_sats[satnum]) {
        deselect_sat (satnum, selected_sats[satnum])
      };
    };
  };

  $scope.sat_motors_clicked = function (sat){
    if (!sat.motors_selected) {
      sat.motors_selected = true;
    }
    else {
      sat.motors_selected = false;
    }
  };

  $scope.sat_radios_clicked = function (sat){
    if (!sat.radios_selected) {
      sat.radios_selected = true;
    }
    else {
      sat.radios_selected = false;
    };
  };

  $scope.set_time_live = function() {
    ThreeJS.reset_time_offset();
  };

  $scope.forward_time = function(time_delta) {
    ThreeJS.add_to_time_offset(time_delta);
  };


  $scope.choose_file = function  () {
    chrome.fileSystem.chooseEntry({type: 'openFile'}, function(tle_file) {
      if (!tle_file) {
        console.log ('No file selected.');
        return;
      }
      google_file_utils.readAsText(tle_file, function (result) {
        // Send the file to a webworker to be parsed.
        // The webworker will update the main thread
        // with new information.
        WorkerManager.update_tles(result);
      });
    });
  };

  var mouse_is_down = false;
  var mouse_X = 0;
  var mouse_Y = 0;

  $scope.mouse_down = function (event) {
    mouse_is_down = true;
  };

  $scope.mouse_up = function (event) {
    mouse_is_down = false;
  };

  $scope.mouse_move = function (event) {
    if (mouse_is_down) {
      var mouse_delta_X = (event.offsetX - mouse_X);
      var mouse_delta_Y = (event.offsetY - mouse_Y);
      ThreeJS.pivot_camera_for_mouse_deltas (mouse_delta_X, mouse_delta_Y);
    };
    mouse_X = event.offsetX;
    mouse_Y = event.offsetY;
  };

  $scope.mouse_wheel = function (event, delta, deltaX, deltaY){
    try{
      event.preventDefault();
    }catch(e){

    }
    ThreeJS.zoom_camera_for_scroll_delta(delta);
  };

  $scope.switch_to_ground_camera = function (satnum) {
    ThreeJS.switch_to_ground_camera();
  };

  $scope.switch_to_space_camera = function (satnum) {
    ThreeJS.switch_to_space_camera();
  };

  $scope.set_observer_location = function (satnum) {
    ThreeJS.set_observer_location($scope.observer_longitude, $scope.observer_latitude, $scope.observer_altitude);
    WorkerManager.set_observer_location($scope.observer_longitude, $scope.observer_latitude, $scope.observer_altitude);
  };

  /* Prepare Motor/Radio Controller. */
  $scope.COM_list = [];
  $scope.selected_motor_port = "";
  $scope.selected_radio_port = "";

  $scope.supported_motor_types = Motors.get_supported_motors();
  $scope.supported_radio_types = Radios.get_supported_radios();
  $scope.selected_motor_type = $scope.supported_motor_types[0];
  $scope.selected_radio_type = $scope.supported_radio_types[0];

  function refresh_com_ports_list () {
    chrome.serial.getDevices(function(ports) {
      if (ports.length > 0) {
        var i = 0;
        for (i = 0; i < ports.length; i++) {
          $scope.$apply (function () {
            $scope.COM_list.push(ports[i].path);
          });
        };
        $scope.$apply (function () {
          $scope.selected_motor_port = ports[0].path;
          $scope.selected_radio_port = ports[0].path;
        });
      }
      else {
        $scope.selected_port = "¡ERROR, HOMBRE!";
      };
    });
  };
  refresh_com_ports_list();

  $scope.refresh_com_ports_list = refresh_com_ports_list;

  $scope.connect_motors_to_sat = function (satnum, selected_port, selected_motor_type){
    function motor_tracking_callback(motor_data) {
      $scope.$apply(function() {
        $scope.sat_table[satnum]["motor_az"] = motor_data["azimuth"];
        $scope.sat_table[satnum]["motor_el"] = motor_data["elevation"];
        $scope.sat_table[satnum]["motor_status"] = motor_data["motor_status"];
      });
    };
    Motors.connect_motors(satnum, selected_port, selected_motor_type, motor_tracking_callback);
  };

  $scope.start_motor_tracking = function (satnum) {
    Motors.start_motor_tracking(satnum);
  };

  $scope.stop_motor_tracking = function (satnum) {
    Motors.stop_motor_tracking(satnum);
  };

  $scope.close_motors = function (satnum) {
    Motors.close_motors (satnum);
  };

  $scope.connect_radio_to_sat = function (satnum, selected_port, selected_radio_type){
    function radio_tracking_callback(radio_data) {
      $scope.$apply(function() {
        $scope.sat_table[satnum]["radio_main_frequency"] = radio_data["radio_main_frequency"];
        $scope.sat_table[satnum]["radio_sub_frequency"]  = radio_data["radio_sub_frequency"];
      });
    };
    Radios.connect_radio(satnum, selected_port, selected_radio_type, radio_tracking_callback,
      $scope.sat_table[satnum]["uplink_frequency"], $scope.sat_table[satnum]["downlink_frequency"]);
  };

  $scope.start_radio_tracking = function (satnum) {
    Radios.start_radio_tracking(satnum);
  };

  $scope.stop_radio_tracking = function (satnum) {
    Radios.stop_radio_tracking(satnum);
  };

  $scope.close_radio = function (satnum) {
    Radios.close_radio (satnum);
  };
};
