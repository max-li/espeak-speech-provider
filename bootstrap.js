'use strict';

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");


let gSpeechRegistry = Cc['@mozilla.org/synth-voice-registry;1']
                      .getService(Ci.nsISynthVoiceRegistry);

function log(s) {
  dump('LOG: ' + s + '\n');
}

function parseWav(wav) {
  function readInt(i, bytes) {
    let ret = 0;
    let shft = 0;
    while (bytes) {
      ret += wav[i] << shft;
      shft += 8;
      i++;
      bytes--;
    }
    return ret;
  }
  if (readInt(20, 2) != 1) throw 'Invalid compression code, not PCM';
  if (readInt(22, 2) != 1) throw 'Invalid number of channels, not 1';
  return {
    sampleRate: readInt(24, 4),
    bitsPerSample: readInt(34, 2),
    samples: wav.subarray(44)
  };
}

function startup(data, reason) {
  let service = {
    serviceType: Ci.nsISpeechService.SERVICETYPE_DIRECT_AUDIO,

    speak: function speak(aText, aUri, aRate, aPitch, aTask) {
      let speakWorker = new Worker('chrome://speech/content/speakWorker.js');
      speakWorker.onmessage = function(event) {
        let data = parseWav(event.data);
        aTask.setup({QueryInterface: XPCOMUtils.generateQI([Ci.nsISpeechTaskCallback]),
                     onPause: function() {},
                     onResume: function() {},
                     onCancel: function() {}},
                    1, data.sampleRate);
        let audio = new Int16Array(data.samples.length/2);
        for (let i = 0; i < audio.length; i++) {
          // XXX: I don't think I can always assume little endianness
          audio[i] = (data.samples[2*i+1] << 8) + data.samples[2*i];
        }
        aTask.sendAudio(audio, []);
        aTask.sendAudio([], []);
      };
      speakWorker.postMessage({ text: aText,
                                args: { pitch: Math.min(99, 50 * aPitch),
                                        speed: Math.max(80, 175 * aRate) } });
    },

    QueryInterface: function(iid) {
      return this;
    },

    getInterfaces: function(c) {},

    getHelperForLanguage: function() {}
  }

  let prefs = Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefService);
  prefs = prefs.getBranch("media.webspeech.synth.");
  prefs.setBoolPref('enabled', true);

  gSpeechRegistry.addVoice(service, 'speech-addon', 'eSpeak', 'en-US', true);
}

function shutdown(data, reason) {}
function install(data, reason) {}
function uninstall(data, reason) {}



