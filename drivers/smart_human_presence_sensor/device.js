"use strict";

// ensure we have the tuya cluster
require("../../lib/TuyaSpecificCluster");

const TuyaSpecificClusterDevice = require("../../lib/TuyaSpecificClusterDevice");

// info: https://templates.blakadder.com/ZY-M100.html

const dataPoints = {
  presence: 1,
  sensitivity: 2,
  nearDetection: 3,
  farDetection: 4,
  detectionDelay: 101,
  detectionClearDelay: 102,
  luminance: 104,
  distance: 9,
  selfCheck: 6,
};

const selfCheckEnum = {
  0: "checking",
  1: "check_success",
  2: "check_failure",
  3: "others",
  4: "common_fault",
  5: "radar_fault",
};

const clamp = (value, min, max) => {
  return value < min ? min : value > max ? max : value;
};

// note: the `dataTypes`, `convertMultiByteNumberPayloadToSingleDecimalNumber`, `getDataValue` are copied (but already duplicated) from other drivers. could probably be placed in a common place.
const dataTypes = {
  raw: 0, // [ bytes ]
  bool: 1, // [0/1]
  value: 2, // [ 4 byte value ]
  string: 3, // [ N byte string ]
  enum: 4, // [ 0-255 ]
  bitmap: 5, // [ 1,2,4 bytes ] as bits
};

const convertMultiByteNumberPayloadToSingleDecimalNumber = (chunks) => {
  let value = 0;

  for (let i = 0; i < chunks.length; i++) {
    value = value << 8;
    value += chunks[i];
  }

  return value;
};

const getDataValue = (dpValue) => {
  switch (dpValue.datatype) {
    case dataTypes.raw:
      return dpValue.data;
    case dataTypes.bool:
      return dpValue.data[0] === 1;
    case dataTypes.value:
      return convertMultiByteNumberPayloadToSingleDecimalNumber(dpValue.data);
    case dataTypes.string:
      let dataString = "";
      for (let i = 0; i < dpValue.data.length; ++i) {
        dataString += String.fromCharCode(dpValue.data[i]);
      }
      return dataString;
    case dataTypes.enum:
      return dpValue.data[0];
    case dataTypes.bitmap:
      return convertMultiByteNumberPayloadToSingleDecimalNumber(dpValue.data);
  }
};

const dataPointToCapability = {
  [dataPoints.presence]: async (device, value) => {
    this.log(`presence: ${value} (type ${typeof value})`);
    await device.setCapabilityValue("alarm_motion", value === 1);
  },
  [dataPoints.sensitivity]: (device, value) => {
    this.debug(`sensitivity: ${value} (type ${typeof value})`);
  },
  [dataPoints.nearDetection]: (device, value) => {
    this.debug(`nearDetection: ${value} (type ${typeof value})`);
  },
  [dataPoints.farDetection]: (device, value) => {
    this.debug(`farDetection: ${value} (type ${typeof value})`);
  },
  [dataPoints.detectionDelay]: (device, value) => {
    this.debug(`detectionDelay: ${value} (type ${typeof value})`);
  },
  [dataPoints.detectionClearDelay]: (device, value) => {
    this.debug(`detectionClearDelay: ${value} (type ${typeof value})`);
  },
  [dataPoints.luminance]: async (device, value) => {
    this.debug(`luminance: ${value} (type ${typeof value})`);
    await device.setCapabilityValue("measure_luminance", value);
  },
  [dataPoints.distance]: (device, value) => {
    this.debug(`distance: ${value} (type ${typeof value})`);
  },
  [dataPoints.selfCheck]: (device, value) => {
    this.info(
      `selfCheck: ${value} (type ${typeof value}, ${selfCheckEnum[value]})`
    );
  },
};

const settingsKeysToTuyaDataPoint = {
  sensitivity: (device, value) => {
    device.writeData32(dataPoints.sensitivity, value);
  },
  near_detection: (device, value) => {
    device.writeData32(dataPoints.nearDetection, value);
  },
  far_detection: (device, value) => {
    device.writeData32(dataPoints.farDetection, value);
  },
  detection_delay: (device, value) => {
    device.writeData32(dataPoints.detectionDelay, clamp(value * 10, 0, 100));
  },
  detection_clear_delay: (device, value) => {
    device.writeData32(dataPoints.detectionClearDelay, value);
  },
};

class smart_human_presence_sensor extends TuyaSpecificClusterDevice {
  onNodeInit = async ({ zclNode }) => {
    this.printNode();

    zclNode.endpoints[1].clusters.tuya.on("response", (value) => {
      this.processResponse(value);
    });
  };

  onSettings = ({ oldSettings, newSettings, changedKeys }) => {
    for (const key of changedKeys) {
      settingsKeysToTuyaDataPoint[key](this, newSettings[key]);
    }
  };

  onDeleted = () => {
    this.log("Smart Human Presence Sensor removed");
  };

  processResponse = async (data) => {
    const dp = data.dp;

    // the data point 103 is undocumented
    if (dp === 103) return;

    const measuredValue = getDataValue(data);
    this.log("processing response", dp, measuredValue);

    const fn = dataPointToCapability[dp];
    if (fn) {
      try {
        await dataPointToCapability[dp](this, measuredValue);
      } catch (err) {
        this.log(`Error setting capability value for data point.`, err);
      }
    } else {
      console.log(this.warn);
      this.warn(`Unhandled data point: ${dp}`);
    }
  };
}

module.exports = smart_human_presence_sensor;
