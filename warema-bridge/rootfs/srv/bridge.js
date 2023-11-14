const warema = require('warema-wms-venetian-blinds');
var mqtt = require('mqtt')

process.on('SIGINT', function() {
    process.exit(0);
});


const ignoredDevices = process.env.IGNORED_DEVICES ? process.env.IGNORED_DEVICES.split(',') : []
const forceDevices = process.env.FORCE_DEVICES ? process.env.FORCE_DEVICES.split(',') : []

const settingsPar = {
    wmsChannel   : process.env.WMS_CHANNEL     || 17,
    wmsKey       : process.env.WMS_KEY         || '00112233445566778899AABBCCDDEEFF',
    wmsPanid     : process.env.WMS_PAN_ID      || 'FFFF',
    wmsSerialPort: process.env.WMS_SERIAL_PORT || '/dev/ttyUSB0',
  };

var registered_shades = []
var shade_position = []

function registerDevice(element) {
  snr = String(element.snr).replace(/^0+/, '')
  console.log('Found device of type "' + element.typeStr + '" with type #' + element.type)
  console.log('Registering ' + snr)
  var topic = 'homeassistant/cover/' + snr + '/' + snr + '/config'
  var availability_topic = 'warema/' + snr + '/availability'

  var base_payload = {
    name: null,
    availability: [
      {topic: 'warema/bridge/state'},
      {topic: availability_topic}
    ],
    unique_id: snr
  }

  var base_device = {
    identifiers: snr,
    manufacturer: "Warema",
    name: snr
  }

  var model
  var payload
  switch (parseInt(element.type)) {
    case 6:
    case 63:
      model = 'Weather station'
      payload = {
        ...base_payload,
        device: {
          ...base_device,
          model: model
        }
      }
      break
    // WMS WebControl Pro - while part of the network, we have no business to do with it.
    case 9:
      return
    case 20:
      model = 'Plug receiver'
      payload = {
        ...base_payload,
        device: {
          ...base_device,
          model: model
        },
        position_open: 0,
        position_closed: 100,
        command_topic: 'warema/' + snr + '/set',
        position_topic: 'warema/' + snr + '/position',
        tilt_status_topic: 'warema/' + snr + '/tilt',
        set_position_topic: 'warema/' + snr + '/set_position',
        tilt_command_topic: 'warema/' + snr + '/set_tilt',
        tilt_closed_value: 100,
        tilt_opened_value: -100,
        tilt_min: 100,
        tilt_max: -100,
      }
      break
    case 21:
      model = 'Actuator UP'
      payload = {
        ...base_payload,
        device: {
          ...base_device,
          model: model
        },
        position_open: 0,
        position_closed: 100,
        command_topic: 'warema/' + snr + '/set',
        position_topic: 'warema/' + snr + '/position',
        tilt_status_topic: 'warema/' + snr + '/tilt',
        set_position_topic: 'warema/' + snr + '/set_position',
        tilt_command_topic: 'warema/' + snr + '/set_tilt',
        tilt_closed_value: 100,
        tilt_opened_value: -100,
        tilt_min: 100,
        tilt_max: -100,
      }
      break
    case 25:
      model = 'Vertical awning'
      payload = {
        ...base_payload,
        device: {
          ...base_device,
          model: model
        },
        position_open: 0,
        position_closed: 100,
        command_topic: 'warema/' + snr + '/set',
        position_topic: 'warema/' + snr + '/position',
        set_position_topic: 'warema/' + snr + '/set_position',
      }
      break
    default:
      console.log('Unrecognized device type: ' + element.type)
      model = 'Unknown model ' + element.type
      return
  }

  if (ignoredDevices.includes(element.snr.toString())) {
    console.log('Ignoring and removing device ' + snr + ' (type ' + element.type + ')')
  } else {
    console.log('Adding device ' + snr + ' (type ' + element.type + ')')

    stickUsb.vnBlindAdd(parseInt(element.snr), element.snr.toString());
    registered_shades += snr
    client.publish(availability_topic, 'online', {retain: true})
  }
  client.publish(topic, JSON.stringify(payload), {retain: true})
}

function registerDevices() {
  if (forceDevices && forceDevices.length) {
    forceDevices.forEach(element => {
      registerDevice({snr: element.split(':')[0], type: element.split(':')[1] ? element.split(':')[1] : 25 })
    })
  } else {
    console.log('Scanning...')
    stickUsb.scanDevices({autoAssignBlinds: false});
  }
}

function callback(err, msg) {
  if(err) {
    console.log('ERROR: ' + err);
  }
  if(msg) {
    switch (msg.topic) {
      case 'wms-vb-init-completion':
        console.log('Warema init completed (AMK)')
        registerDevices()
        stickUsb.setPosUpdInterval(10000);
        stickUsb.setWatchMovingBlindsInterval(1000)
        break
      case 'wms-vb-rcv-weather-broadcast':
        if (registered_shades.includes(msg.payload.weather.snr)) {
          client.publish('warema/' + msg.payload.weather.snr + '/illuminance/state', msg.payload.weather.lumen.toString(), {retain: true})
          client.publish('warema/' + msg.payload.weather.snr + '/temperature/state', msg.payload.weather.temp.toString(), {retain: true})
          client.publish('warema/' + msg.payload.weather.snr + '/wind/state', msg.payload.weather.wind.toString(), {retain: true})
          client.publish('warema/' + msg.payload.weather.snr + '/rain/state', msg.payload.weather.rain.toString(), {retain: true})            
        } else {
          var availability_topic = 'warema/' + msg.payload.weather.snr + '/availability'
          var payload = {
            name: null,
            availability: [
              {topic: 'warema/bridge/state'},
              {topic: availability_topic}
            ],
            device: {
              identifiers: msg.payload.weather.snr,
              manufacturer: 'Warema',
              model: 'Weather Station',
              name: msg.payload.weather.snr
            },
            force_update: true
          }

          var illuminance_payload = {
            ...payload,
            state_topic: 'warema/' + msg.payload.weather.snr + '/illuminance/state',
            device_class: 'illuminance',
            unique_id: msg.payload.weather.snr + '_illuminance',
            unit_of_measurement: 'lx',
          }
          client.publish('homeassistant/sensor/' + msg.payload.weather.snr + '/illuminance/config', JSON.stringify(illuminance_payload), {retain: true})

          var temperature_payload = {
            ...payload,
            state_topic: 'warema/' + msg.payload.weather.snr + '/temperature/state',
            device_class: 'temperature',
            unique_id: msg.payload.weather.snr + '_temperature',
            unit_of_measurement: '°C',
          }
          client.publish('homeassistant/sensor/' + msg.payload.weather.snr + '/temperature/config', JSON.stringify(temperature_payload), {retain: true})

          client.publish(availability_topic, 'online', {retain: true})
          registered_shades += msg.payload.weather.snr
        }
        break
      case 'wms-vb-blind-position-update':
        client.publish('warema/' + msg.payload.snr + '/position', msg.payload.position.toString(), {retain: true})
        client.publish('warema/' + msg.payload.snr + '/tilt', msg.payload.angle.toString(), {retain: true})
        shade_position[msg.payload.snr] = {
          position: msg.payload.position,
          angle: msg.payload.angle
        }
        break
      case 'wms-vb-scanned-devices':
        console.log('Scanned devices.')
        msg.payload.devices.forEach(element => registerDevice(element))
        console.log(stickUsb.vnBlindsList())
        break
      default:
        console.log('UNKNOWN MESSAGE: ' + JSON.stringify(msg));
    }
  }
}

var client = mqtt.connect(
  "mqtt://core-mosquitto:1883",
  {
    username: "mqtt_benutzer",
    password: "geheim",
    will: {
      topic: 'warema/bridge/state',
      payload: 'offline',
      retain: true
    }
  }
)

var stickUsb

client.on('connect', function (connack) {
  console.log('Connected to MQTT')
  console.log('Connected as user: ' + process.env.MQTT_USER)
  client.subscribe('warema/#')
  client.subscribe('homeassistant/status')
  if (stickUsb == null) {
    stickUsb = new warema(settingsPar.wmsSerialPort,
      settingsPar.wmsChannel,
      settingsPar.wmsPanid,
      settingsPar.wmsKey,
      {},
      callback
    );
  }
  client.publish('warema/bridge/state', 'online', {retain: true})
})

client.on('error', function (error) {
  console.log('MQTT Error: ' + error.toString())
})

client.on('message', function (topic, message) {
  // console.log(topic + ':' + message.toString())
  var scope = topic.split('/')[0]
  if (scope == 'warema') {
    var device = parseInt(topic.split('/')[1])
    var command = topic.split('/')[2]
    switch (command) {
      case 'set':
        switch (message.toString()) {
          case 'CLOSE':
            stickUsb.vnBlindSetPosition(device, 100, 100)
            break;
          case 'OPEN':
            stickUsb.vnBlindSetPosition(device, 0, -100)
            break;
          case 'STOP':
            stickUsb.vnBlindStop(device)
            break;
        }
        break
      case 'set_position':
        stickUsb.vnBlindSetPosition(device, parseInt(message), parseInt(shade_position[device]['angle']))
        break
      case 'set_tilt':
        stickUsb.vnBlindSetPosition(device, parseInt(shade_position[device]['position']), parseInt(message))
        break
      //default:
      //  console.log('Unrecognised command from HA')
    }
  } else if (scope == 'homeassistant') {
    if (topic.split('/')[1] == 'status' && message.toString() == 'online') {
      registerDevices()
    }
  }
})
