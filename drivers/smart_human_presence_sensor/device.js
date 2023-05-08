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
  presenceDetectionDelay: 101,
  presenceClearDelay: 102,
  undocumented103: 103,
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
  return Math.max(min, Math.min(max, value));
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
    device.log(`presence: ${value === 1}`);
    await device.setCapabilityValue("alarm_motion", value === 1);
  },
  [dataPoints.sensitivity]: (device, value) => {
    // this is an echo of the configured sensitivity on the device.
    device.log(`sensitivity: ${value}`);
    return Promise.resolve();
  },
  [dataPoints.nearDetection]: (device, value) => {
    // this is an echo of the configured nearDetection on the device.
    device.log(`nearDetection: ${value}`);
    return Promise.resolve();
  },
  [dataPoints.farDetection]: (device, value) => {
    // this is an echo of the configured farDetection on the device.
    device.log(`farDetection: ${value}`);
    return Promise.resolve();
  },
  [dataPoints.presenceDetectionDelay]: (device, value) => {
    // this is an echo of the configured presenceDetectionDelay on the device.
    device.log(`presenceDetectionDelay: ${value}`);
    return Promise.resolve();
  },
  [dataPoints.presenceClearDelay]: (device, value) => {
    // this is an echo of the configured presenceClearDelay on the device.
    device.log(`presenceClearDelay: ${value}`);
    return Promise.resolve();
  },
  [dataPoints.luminance]: async (device, value) => {
    device.log(`luminance: ${value}`);
    await device.setCapabilityValue("measure_luminance", value);
  },
  [dataPoints.distance]: async (device, value) => {
    device.log(`distance: ${value}`);
    await device.setCapabilityValue("meter_distance", value);
  },
  [dataPoints.selfCheck]: async (device, value) => {
    device.log(`selfCheck: ${selfCheckEnum[value]} (${value}))`);
    await device.setSettings({ device_self_check: `${selfCheckEnum[value]}` });
  },
  [dataPoints.undocumented103]: (device, value) => {
    // not sure why the device sends this data point.
    // it seems to always be a string with a single space.
    device.log(`undocumented data point 103. value: '${value}'`);
    return Promise.resolve();
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
    device.writeData32(
      dataPoints.presenceDetectionDelay,
      clamp(value * 10, 0, 100)
    );
  },
  detection_clear_delay: (device, value) => {
    device.writeData32(dataPoints.presenceClearDelay, value);
  },
};

class smart_human_presence_sensor extends TuyaSpecificClusterDevice {
  onNodeInit = async ({ zclNode }) => {
    this.printNode();

    zclNode.endpoints[1].clusters.tuya.on("response", (value) => {
      this.processResponse(value);
    });

    if (this.hasCapability("meter_distance") === false) {
      await this.addCapability("meter_distance");
    }
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
    const measuredValue = getDataValue(data);

    const fn = dataPointToCapability[dp];
    if (fn) {
      try {
        await fn(this, measuredValue);
      } catch (err) {
        this.error(`Could not update capability value for data point.`, err);
      }
    } else {
      this.error(`Unhandled data point: ${dp}`);
    }
  };
}

module.exports = smart_human_presence_sensor;
