import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __commonJS = (cb, mod) => function __require2() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/ws/lib/constants.js
var require_constants = __commonJS({
  "node_modules/ws/lib/constants.js"(exports, module) {
    "use strict";
    var BINARY_TYPES = ["nodebuffer", "arraybuffer", "fragments"];
    var hasBlob = typeof Blob !== "undefined";
    if (hasBlob) BINARY_TYPES.push("blob");
    module.exports = {
      BINARY_TYPES,
      CLOSE_TIMEOUT: 3e4,
      EMPTY_BUFFER: Buffer.alloc(0),
      GUID: "258EAFA5-E914-47DA-95CA-C5AB0DC85B11",
      hasBlob,
      kForOnEventAttribute: Symbol("kIsForOnEventAttribute"),
      kListener: Symbol("kListener"),
      kStatusCode: Symbol("status-code"),
      kWebSocket: Symbol("websocket"),
      NOOP: () => {
      }
    };
  }
});

// node_modules/ws/lib/buffer-util.js
var require_buffer_util = __commonJS({
  "node_modules/ws/lib/buffer-util.js"(exports, module) {
    "use strict";
    var { EMPTY_BUFFER } = require_constants();
    var FastBuffer = Buffer[Symbol.species];
    function concat(list, totalLength) {
      if (list.length === 0) return EMPTY_BUFFER;
      if (list.length === 1) return list[0];
      const target = Buffer.allocUnsafe(totalLength);
      let offset = 0;
      for (let i = 0; i < list.length; i++) {
        const buf = list[i];
        target.set(buf, offset);
        offset += buf.length;
      }
      if (offset < totalLength) {
        return new FastBuffer(target.buffer, target.byteOffset, offset);
      }
      return target;
    }
    function _mask(source, mask, output, offset, length) {
      for (let i = 0; i < length; i++) {
        output[offset + i] = source[i] ^ mask[i & 3];
      }
    }
    function _unmask(buffer, mask) {
      for (let i = 0; i < buffer.length; i++) {
        buffer[i] ^= mask[i & 3];
      }
    }
    function toArrayBuffer(buf) {
      if (buf.length === buf.buffer.byteLength) {
        return buf.buffer;
      }
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length);
    }
    function toBuffer(data) {
      toBuffer.readOnly = true;
      if (Buffer.isBuffer(data)) return data;
      let buf;
      if (data instanceof ArrayBuffer) {
        buf = new FastBuffer(data);
      } else if (ArrayBuffer.isView(data)) {
        buf = new FastBuffer(data.buffer, data.byteOffset, data.byteLength);
      } else {
        buf = Buffer.from(data);
        toBuffer.readOnly = false;
      }
      return buf;
    }
    module.exports = {
      concat,
      mask: _mask,
      toArrayBuffer,
      toBuffer,
      unmask: _unmask
    };
    if (!process.env.WS_NO_BUFFER_UTIL) {
      try {
        const bufferUtil = __require("bufferutil");
        module.exports.mask = function(source, mask, output, offset, length) {
          if (length < 48) _mask(source, mask, output, offset, length);
          else bufferUtil.mask(source, mask, output, offset, length);
        };
        module.exports.unmask = function(buffer, mask) {
          if (buffer.length < 32) _unmask(buffer, mask);
          else bufferUtil.unmask(buffer, mask);
        };
      } catch (e) {
      }
    }
  }
});

// node_modules/ws/lib/limiter.js
var require_limiter = __commonJS({
  "node_modules/ws/lib/limiter.js"(exports, module) {
    "use strict";
    var kDone = Symbol("kDone");
    var kRun = Symbol("kRun");
    var Limiter = class {
      /**
       * Creates a new `Limiter`.
       *
       * @param {Number} [concurrency=Infinity] The maximum number of jobs allowed
       *     to run concurrently
       */
      constructor(concurrency) {
        this[kDone] = () => {
          this.pending--;
          this[kRun]();
        };
        this.concurrency = concurrency || Infinity;
        this.jobs = [];
        this.pending = 0;
      }
      /**
       * Adds a job to the queue.
       *
       * @param {Function} job The job to run
       * @public
       */
      add(job) {
        this.jobs.push(job);
        this[kRun]();
      }
      /**
       * Removes a job from the queue and runs it if possible.
       *
       * @private
       */
      [kRun]() {
        if (this.pending === this.concurrency) return;
        if (this.jobs.length) {
          const job = this.jobs.shift();
          this.pending++;
          job(this[kDone]);
        }
      }
    };
    module.exports = Limiter;
  }
});

// node_modules/ws/lib/permessage-deflate.js
var require_permessage_deflate = __commonJS({
  "node_modules/ws/lib/permessage-deflate.js"(exports, module) {
    "use strict";
    var zlib = __require("zlib");
    var bufferUtil = require_buffer_util();
    var Limiter = require_limiter();
    var { kStatusCode } = require_constants();
    var FastBuffer = Buffer[Symbol.species];
    var TRAILER = Buffer.from([0, 0, 255, 255]);
    var kPerMessageDeflate = Symbol("permessage-deflate");
    var kTotalLength = Symbol("total-length");
    var kCallback = Symbol("callback");
    var kBuffers = Symbol("buffers");
    var kError = Symbol("error");
    var zlibLimiter;
    var PerMessageDeflate2 = class {
      /**
       * Creates a PerMessageDeflate instance.
       *
       * @param {Object} [options] Configuration options
       * @param {(Boolean|Number)} [options.clientMaxWindowBits] Advertise support
       *     for, or request, a custom client window size
       * @param {Boolean} [options.clientNoContextTakeover=false] Advertise/
       *     acknowledge disabling of client context takeover
       * @param {Number} [options.concurrencyLimit=10] The number of concurrent
       *     calls to zlib
       * @param {Boolean} [options.isServer=false] Create the instance in either
       *     server or client mode
       * @param {Number} [options.maxPayload=0] The maximum allowed message length
       * @param {(Boolean|Number)} [options.serverMaxWindowBits] Request/confirm the
       *     use of a custom server window size
       * @param {Boolean} [options.serverNoContextTakeover=false] Request/accept
       *     disabling of server context takeover
       * @param {Number} [options.threshold=1024] Size (in bytes) below which
       *     messages should not be compressed if context takeover is disabled
       * @param {Object} [options.zlibDeflateOptions] Options to pass to zlib on
       *     deflate
       * @param {Object} [options.zlibInflateOptions] Options to pass to zlib on
       *     inflate
       */
      constructor(options) {
        this._options = options || {};
        this._threshold = this._options.threshold !== void 0 ? this._options.threshold : 1024;
        this._maxPayload = this._options.maxPayload | 0;
        this._isServer = !!this._options.isServer;
        this._deflate = null;
        this._inflate = null;
        this.params = null;
        if (!zlibLimiter) {
          const concurrency = this._options.concurrencyLimit !== void 0 ? this._options.concurrencyLimit : 10;
          zlibLimiter = new Limiter(concurrency);
        }
      }
      /**
       * @type {String}
       */
      static get extensionName() {
        return "permessage-deflate";
      }
      /**
       * Create an extension negotiation offer.
       *
       * @return {Object} Extension parameters
       * @public
       */
      offer() {
        const params = {};
        if (this._options.serverNoContextTakeover) {
          params.server_no_context_takeover = true;
        }
        if (this._options.clientNoContextTakeover) {
          params.client_no_context_takeover = true;
        }
        if (this._options.serverMaxWindowBits) {
          params.server_max_window_bits = this._options.serverMaxWindowBits;
        }
        if (this._options.clientMaxWindowBits) {
          params.client_max_window_bits = this._options.clientMaxWindowBits;
        } else if (this._options.clientMaxWindowBits == null) {
          params.client_max_window_bits = true;
        }
        return params;
      }
      /**
       * Accept an extension negotiation offer/response.
       *
       * @param {Array} configurations The extension negotiation offers/reponse
       * @return {Object} Accepted configuration
       * @public
       */
      accept(configurations) {
        configurations = this.normalizeParams(configurations);
        this.params = this._isServer ? this.acceptAsServer(configurations) : this.acceptAsClient(configurations);
        return this.params;
      }
      /**
       * Releases all resources used by the extension.
       *
       * @public
       */
      cleanup() {
        if (this._inflate) {
          this._inflate.close();
          this._inflate = null;
        }
        if (this._deflate) {
          const callback = this._deflate[kCallback];
          this._deflate.close();
          this._deflate = null;
          if (callback) {
            callback(
              new Error(
                "The deflate stream was closed while data was being processed"
              )
            );
          }
        }
      }
      /**
       *  Accept an extension negotiation offer.
       *
       * @param {Array} offers The extension negotiation offers
       * @return {Object} Accepted configuration
       * @private
       */
      acceptAsServer(offers) {
        const opts = this._options;
        const accepted = offers.find((params) => {
          if (opts.serverNoContextTakeover === false && params.server_no_context_takeover || params.server_max_window_bits && (opts.serverMaxWindowBits === false || typeof opts.serverMaxWindowBits === "number" && opts.serverMaxWindowBits > params.server_max_window_bits) || typeof opts.clientMaxWindowBits === "number" && !params.client_max_window_bits) {
            return false;
          }
          return true;
        });
        if (!accepted) {
          throw new Error("None of the extension offers can be accepted");
        }
        if (opts.serverNoContextTakeover) {
          accepted.server_no_context_takeover = true;
        }
        if (opts.clientNoContextTakeover) {
          accepted.client_no_context_takeover = true;
        }
        if (typeof opts.serverMaxWindowBits === "number") {
          accepted.server_max_window_bits = opts.serverMaxWindowBits;
        }
        if (typeof opts.clientMaxWindowBits === "number") {
          accepted.client_max_window_bits = opts.clientMaxWindowBits;
        } else if (accepted.client_max_window_bits === true || opts.clientMaxWindowBits === false) {
          delete accepted.client_max_window_bits;
        }
        return accepted;
      }
      /**
       * Accept the extension negotiation response.
       *
       * @param {Array} response The extension negotiation response
       * @return {Object} Accepted configuration
       * @private
       */
      acceptAsClient(response) {
        const params = response[0];
        if (this._options.clientNoContextTakeover === false && params.client_no_context_takeover) {
          throw new Error('Unexpected parameter "client_no_context_takeover"');
        }
        if (!params.client_max_window_bits) {
          if (typeof this._options.clientMaxWindowBits === "number") {
            params.client_max_window_bits = this._options.clientMaxWindowBits;
          }
        } else if (this._options.clientMaxWindowBits === false || typeof this._options.clientMaxWindowBits === "number" && params.client_max_window_bits > this._options.clientMaxWindowBits) {
          throw new Error(
            'Unexpected or invalid parameter "client_max_window_bits"'
          );
        }
        return params;
      }
      /**
       * Normalize parameters.
       *
       * @param {Array} configurations The extension negotiation offers/reponse
       * @return {Array} The offers/response with normalized parameters
       * @private
       */
      normalizeParams(configurations) {
        configurations.forEach((params) => {
          Object.keys(params).forEach((key) => {
            let value = params[key];
            if (value.length > 1) {
              throw new Error(`Parameter "${key}" must have only a single value`);
            }
            value = value[0];
            if (key === "client_max_window_bits") {
              if (value !== true) {
                const num = +value;
                if (!Number.isInteger(num) || num < 8 || num > 15) {
                  throw new TypeError(
                    `Invalid value for parameter "${key}": ${value}`
                  );
                }
                value = num;
              } else if (!this._isServer) {
                throw new TypeError(
                  `Invalid value for parameter "${key}": ${value}`
                );
              }
            } else if (key === "server_max_window_bits") {
              const num = +value;
              if (!Number.isInteger(num) || num < 8 || num > 15) {
                throw new TypeError(
                  `Invalid value for parameter "${key}": ${value}`
                );
              }
              value = num;
            } else if (key === "client_no_context_takeover" || key === "server_no_context_takeover") {
              if (value !== true) {
                throw new TypeError(
                  `Invalid value for parameter "${key}": ${value}`
                );
              }
            } else {
              throw new Error(`Unknown parameter "${key}"`);
            }
            params[key] = value;
          });
        });
        return configurations;
      }
      /**
       * Decompress data. Concurrency limited.
       *
       * @param {Buffer} data Compressed data
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @public
       */
      decompress(data, fin, callback) {
        zlibLimiter.add((done) => {
          this._decompress(data, fin, (err, result) => {
            done();
            callback(err, result);
          });
        });
      }
      /**
       * Compress data. Concurrency limited.
       *
       * @param {(Buffer|String)} data Data to compress
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @public
       */
      compress(data, fin, callback) {
        zlibLimiter.add((done) => {
          this._compress(data, fin, (err, result) => {
            done();
            callback(err, result);
          });
        });
      }
      /**
       * Decompress data.
       *
       * @param {Buffer} data Compressed data
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @private
       */
      _decompress(data, fin, callback) {
        const endpoint = this._isServer ? "client" : "server";
        if (!this._inflate) {
          const key = `${endpoint}_max_window_bits`;
          const windowBits = typeof this.params[key] !== "number" ? zlib.Z_DEFAULT_WINDOWBITS : this.params[key];
          this._inflate = zlib.createInflateRaw({
            ...this._options.zlibInflateOptions,
            windowBits
          });
          this._inflate[kPerMessageDeflate] = this;
          this._inflate[kTotalLength] = 0;
          this._inflate[kBuffers] = [];
          this._inflate.on("error", inflateOnError);
          this._inflate.on("data", inflateOnData);
        }
        this._inflate[kCallback] = callback;
        this._inflate.write(data);
        if (fin) this._inflate.write(TRAILER);
        this._inflate.flush(() => {
          const err = this._inflate[kError];
          if (err) {
            this._inflate.close();
            this._inflate = null;
            callback(err);
            return;
          }
          const data2 = bufferUtil.concat(
            this._inflate[kBuffers],
            this._inflate[kTotalLength]
          );
          if (this._inflate._readableState.endEmitted) {
            this._inflate.close();
            this._inflate = null;
          } else {
            this._inflate[kTotalLength] = 0;
            this._inflate[kBuffers] = [];
            if (fin && this.params[`${endpoint}_no_context_takeover`]) {
              this._inflate.reset();
            }
          }
          callback(null, data2);
        });
      }
      /**
       * Compress data.
       *
       * @param {(Buffer|String)} data Data to compress
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @private
       */
      _compress(data, fin, callback) {
        const endpoint = this._isServer ? "server" : "client";
        if (!this._deflate) {
          const key = `${endpoint}_max_window_bits`;
          const windowBits = typeof this.params[key] !== "number" ? zlib.Z_DEFAULT_WINDOWBITS : this.params[key];
          this._deflate = zlib.createDeflateRaw({
            ...this._options.zlibDeflateOptions,
            windowBits
          });
          this._deflate[kTotalLength] = 0;
          this._deflate[kBuffers] = [];
          this._deflate.on("data", deflateOnData);
        }
        this._deflate[kCallback] = callback;
        this._deflate.write(data);
        this._deflate.flush(zlib.Z_SYNC_FLUSH, () => {
          if (!this._deflate) {
            return;
          }
          let data2 = bufferUtil.concat(
            this._deflate[kBuffers],
            this._deflate[kTotalLength]
          );
          if (fin) {
            data2 = new FastBuffer(data2.buffer, data2.byteOffset, data2.length - 4);
          }
          this._deflate[kCallback] = null;
          this._deflate[kTotalLength] = 0;
          this._deflate[kBuffers] = [];
          if (fin && this.params[`${endpoint}_no_context_takeover`]) {
            this._deflate.reset();
          }
          callback(null, data2);
        });
      }
    };
    module.exports = PerMessageDeflate2;
    function deflateOnData(chunk) {
      this[kBuffers].push(chunk);
      this[kTotalLength] += chunk.length;
    }
    function inflateOnData(chunk) {
      this[kTotalLength] += chunk.length;
      if (this[kPerMessageDeflate]._maxPayload < 1 || this[kTotalLength] <= this[kPerMessageDeflate]._maxPayload) {
        this[kBuffers].push(chunk);
        return;
      }
      this[kError] = new RangeError("Max payload size exceeded");
      this[kError].code = "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH";
      this[kError][kStatusCode] = 1009;
      this.removeListener("data", inflateOnData);
      this.reset();
    }
    function inflateOnError(err) {
      this[kPerMessageDeflate]._inflate = null;
      if (this[kError]) {
        this[kCallback](this[kError]);
        return;
      }
      err[kStatusCode] = 1007;
      this[kCallback](err);
    }
  }
});

// node_modules/ws/lib/validation.js
var require_validation = __commonJS({
  "node_modules/ws/lib/validation.js"(exports, module) {
    "use strict";
    var { isUtf8 } = __require("buffer");
    var { hasBlob } = require_constants();
    var tokenChars = [
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      // 0 - 15
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      // 16 - 31
      0,
      1,
      0,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      1,
      1,
      0,
      1,
      1,
      0,
      // 32 - 47
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      0,
      0,
      0,
      // 48 - 63
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      // 64 - 79
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      1,
      1,
      // 80 - 95
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      // 96 - 111
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      1,
      0,
      1,
      0
      // 112 - 127
    ];
    function isValidStatusCode(code) {
      return code >= 1e3 && code <= 1014 && code !== 1004 && code !== 1005 && code !== 1006 || code >= 3e3 && code <= 4999;
    }
    function _isValidUTF8(buf) {
      const len = buf.length;
      let i = 0;
      while (i < len) {
        if ((buf[i] & 128) === 0) {
          i++;
        } else if ((buf[i] & 224) === 192) {
          if (i + 1 === len || (buf[i + 1] & 192) !== 128 || (buf[i] & 254) === 192) {
            return false;
          }
          i += 2;
        } else if ((buf[i] & 240) === 224) {
          if (i + 2 >= len || (buf[i + 1] & 192) !== 128 || (buf[i + 2] & 192) !== 128 || buf[i] === 224 && (buf[i + 1] & 224) === 128 || // Overlong
          buf[i] === 237 && (buf[i + 1] & 224) === 160) {
            return false;
          }
          i += 3;
        } else if ((buf[i] & 248) === 240) {
          if (i + 3 >= len || (buf[i + 1] & 192) !== 128 || (buf[i + 2] & 192) !== 128 || (buf[i + 3] & 192) !== 128 || buf[i] === 240 && (buf[i + 1] & 240) === 128 || // Overlong
          buf[i] === 244 && buf[i + 1] > 143 || buf[i] > 244) {
            return false;
          }
          i += 4;
        } else {
          return false;
        }
      }
      return true;
    }
    function isBlob(value) {
      return hasBlob && typeof value === "object" && typeof value.arrayBuffer === "function" && typeof value.type === "string" && typeof value.stream === "function" && (value[Symbol.toStringTag] === "Blob" || value[Symbol.toStringTag] === "File");
    }
    module.exports = {
      isBlob,
      isValidStatusCode,
      isValidUTF8: _isValidUTF8,
      tokenChars
    };
    if (isUtf8) {
      module.exports.isValidUTF8 = function(buf) {
        return buf.length < 24 ? _isValidUTF8(buf) : isUtf8(buf);
      };
    } else if (!process.env.WS_NO_UTF_8_VALIDATE) {
      try {
        const isValidUTF8 = __require("utf-8-validate");
        module.exports.isValidUTF8 = function(buf) {
          return buf.length < 32 ? _isValidUTF8(buf) : isValidUTF8(buf);
        };
      } catch (e) {
      }
    }
  }
});

// node_modules/ws/lib/receiver.js
var require_receiver = __commonJS({
  "node_modules/ws/lib/receiver.js"(exports, module) {
    "use strict";
    var { Writable } = __require("stream");
    var PerMessageDeflate2 = require_permessage_deflate();
    var {
      BINARY_TYPES,
      EMPTY_BUFFER,
      kStatusCode,
      kWebSocket
    } = require_constants();
    var { concat, toArrayBuffer, unmask } = require_buffer_util();
    var { isValidStatusCode, isValidUTF8 } = require_validation();
    var FastBuffer = Buffer[Symbol.species];
    var GET_INFO = 0;
    var GET_PAYLOAD_LENGTH_16 = 1;
    var GET_PAYLOAD_LENGTH_64 = 2;
    var GET_MASK = 3;
    var GET_DATA = 4;
    var INFLATING = 5;
    var DEFER_EVENT = 6;
    var Receiver2 = class extends Writable {
      /**
       * Creates a Receiver instance.
       *
       * @param {Object} [options] Options object
       * @param {Boolean} [options.allowSynchronousEvents=true] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {String} [options.binaryType=nodebuffer] The type for binary data
       * @param {Object} [options.extensions] An object containing the negotiated
       *     extensions
       * @param {Boolean} [options.isServer=false] Specifies whether to operate in
       *     client or server mode
       * @param {Number} [options.maxBufferedChunks=0] The maximum number of
       *     buffered data chunks
       * @param {Number} [options.maxFragments=0] The maximum number of message
       *     fragments
       * @param {Number} [options.maxPayload=0] The maximum allowed message length
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       */
      constructor(options = {}) {
        super();
        this._allowSynchronousEvents = options.allowSynchronousEvents !== void 0 ? options.allowSynchronousEvents : true;
        this._binaryType = options.binaryType || BINARY_TYPES[0];
        this._extensions = options.extensions || {};
        this._isServer = !!options.isServer;
        this._maxBufferedChunks = options.maxBufferedChunks | 0;
        this._maxFragments = options.maxFragments | 0;
        this._maxPayload = options.maxPayload | 0;
        this._skipUTF8Validation = !!options.skipUTF8Validation;
        this[kWebSocket] = void 0;
        this._bufferedBytes = 0;
        this._buffers = [];
        this._compressed = false;
        this._payloadLength = 0;
        this._mask = void 0;
        this._fragmented = 0;
        this._masked = false;
        this._fin = false;
        this._opcode = 0;
        this._totalPayloadLength = 0;
        this._messageLength = 0;
        this._numFragments = 0;
        this._fragments = [];
        this._errored = false;
        this._loop = false;
        this._state = GET_INFO;
      }
      /**
       * Implements `Writable.prototype._write()`.
       *
       * @param {Buffer} chunk The chunk of data to write
       * @param {String} encoding The character encoding of `chunk`
       * @param {Function} cb Callback
       * @private
       */
      _write(chunk, encoding, cb) {
        if (this._opcode === 8 && this._state == GET_INFO) return cb();
        if (this._maxBufferedChunks > 0 && this._buffers.length >= this._maxBufferedChunks) {
          cb(
            this.createError(
              RangeError,
              "Too many buffered chunks",
              false,
              1008,
              "WS_ERR_TOO_MANY_BUFFERED_PARTS"
            )
          );
          return;
        }
        this._bufferedBytes += chunk.length;
        this._buffers.push(chunk);
        this.startLoop(cb);
      }
      /**
       * Consumes `n` bytes from the buffered data.
       *
       * @param {Number} n The number of bytes to consume
       * @return {Buffer} The consumed bytes
       * @private
       */
      consume(n) {
        this._bufferedBytes -= n;
        if (n === this._buffers[0].length) return this._buffers.shift();
        if (n < this._buffers[0].length) {
          const buf = this._buffers[0];
          this._buffers[0] = new FastBuffer(
            buf.buffer,
            buf.byteOffset + n,
            buf.length - n
          );
          return new FastBuffer(buf.buffer, buf.byteOffset, n);
        }
        const dst = Buffer.allocUnsafe(n);
        do {
          const buf = this._buffers[0];
          const offset = dst.length - n;
          if (n >= buf.length) {
            dst.set(this._buffers.shift(), offset);
          } else {
            dst.set(new Uint8Array(buf.buffer, buf.byteOffset, n), offset);
            this._buffers[0] = new FastBuffer(
              buf.buffer,
              buf.byteOffset + n,
              buf.length - n
            );
          }
          n -= buf.length;
        } while (n > 0);
        return dst;
      }
      /**
       * Starts the parsing loop.
       *
       * @param {Function} cb Callback
       * @private
       */
      startLoop(cb) {
        this._loop = true;
        do {
          switch (this._state) {
            case GET_INFO:
              this.getInfo(cb);
              break;
            case GET_PAYLOAD_LENGTH_16:
              this.getPayloadLength16(cb);
              break;
            case GET_PAYLOAD_LENGTH_64:
              this.getPayloadLength64(cb);
              break;
            case GET_MASK:
              this.getMask();
              break;
            case GET_DATA:
              this.getData(cb);
              break;
            case INFLATING:
            case DEFER_EVENT:
              this._loop = false;
              return;
          }
        } while (this._loop);
        if (!this._errored) cb();
      }
      /**
       * Reads the first two bytes of a frame.
       *
       * @param {Function} cb Callback
       * @private
       */
      getInfo(cb) {
        if (this._bufferedBytes < 2) {
          this._loop = false;
          return;
        }
        const buf = this.consume(2);
        if ((buf[0] & 48) !== 0) {
          const error = this.createError(
            RangeError,
            "RSV2 and RSV3 must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_RSV_2_3"
          );
          cb(error);
          return;
        }
        const compressed = (buf[0] & 64) === 64;
        if (compressed && !this._extensions[PerMessageDeflate2.extensionName]) {
          const error = this.createError(
            RangeError,
            "RSV1 must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_RSV_1"
          );
          cb(error);
          return;
        }
        this._fin = (buf[0] & 128) === 128;
        this._opcode = buf[0] & 15;
        this._payloadLength = buf[1] & 127;
        if (this._opcode === 0) {
          if (compressed) {
            const error = this.createError(
              RangeError,
              "RSV1 must be clear",
              true,
              1002,
              "WS_ERR_UNEXPECTED_RSV_1"
            );
            cb(error);
            return;
          }
          if (!this._fragmented) {
            const error = this.createError(
              RangeError,
              "invalid opcode 0",
              true,
              1002,
              "WS_ERR_INVALID_OPCODE"
            );
            cb(error);
            return;
          }
          this._opcode = this._fragmented;
        } else if (this._opcode === 1 || this._opcode === 2) {
          if (this._fragmented) {
            const error = this.createError(
              RangeError,
              `invalid opcode ${this._opcode}`,
              true,
              1002,
              "WS_ERR_INVALID_OPCODE"
            );
            cb(error);
            return;
          }
          this._compressed = compressed;
        } else if (this._opcode > 7 && this._opcode < 11) {
          if (!this._fin) {
            const error = this.createError(
              RangeError,
              "FIN must be set",
              true,
              1002,
              "WS_ERR_EXPECTED_FIN"
            );
            cb(error);
            return;
          }
          if (compressed) {
            const error = this.createError(
              RangeError,
              "RSV1 must be clear",
              true,
              1002,
              "WS_ERR_UNEXPECTED_RSV_1"
            );
            cb(error);
            return;
          }
          if (this._payloadLength > 125 || this._opcode === 8 && this._payloadLength === 1) {
            const error = this.createError(
              RangeError,
              `invalid payload length ${this._payloadLength}`,
              true,
              1002,
              "WS_ERR_INVALID_CONTROL_PAYLOAD_LENGTH"
            );
            cb(error);
            return;
          }
        } else {
          const error = this.createError(
            RangeError,
            `invalid opcode ${this._opcode}`,
            true,
            1002,
            "WS_ERR_INVALID_OPCODE"
          );
          cb(error);
          return;
        }
        if (!this._fin && !this._fragmented) this._fragmented = this._opcode;
        this._masked = (buf[1] & 128) === 128;
        if (this._isServer) {
          if (!this._masked) {
            const error = this.createError(
              RangeError,
              "MASK must be set",
              true,
              1002,
              "WS_ERR_EXPECTED_MASK"
            );
            cb(error);
            return;
          }
        } else if (this._masked) {
          const error = this.createError(
            RangeError,
            "MASK must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_MASK"
          );
          cb(error);
          return;
        }
        if (this._payloadLength === 126) this._state = GET_PAYLOAD_LENGTH_16;
        else if (this._payloadLength === 127) this._state = GET_PAYLOAD_LENGTH_64;
        else this.haveLength(cb);
      }
      /**
       * Gets extended payload length (7+16).
       *
       * @param {Function} cb Callback
       * @private
       */
      getPayloadLength16(cb) {
        if (this._bufferedBytes < 2) {
          this._loop = false;
          return;
        }
        this._payloadLength = this.consume(2).readUInt16BE(0);
        this.haveLength(cb);
      }
      /**
       * Gets extended payload length (7+64).
       *
       * @param {Function} cb Callback
       * @private
       */
      getPayloadLength64(cb) {
        if (this._bufferedBytes < 8) {
          this._loop = false;
          return;
        }
        const buf = this.consume(8);
        const num = buf.readUInt32BE(0);
        if (num > Math.pow(2, 53 - 32) - 1) {
          const error = this.createError(
            RangeError,
            "Unsupported WebSocket frame: payload length > 2^53 - 1",
            false,
            1009,
            "WS_ERR_UNSUPPORTED_DATA_PAYLOAD_LENGTH"
          );
          cb(error);
          return;
        }
        this._payloadLength = num * Math.pow(2, 32) + buf.readUInt32BE(4);
        this.haveLength(cb);
      }
      /**
       * Payload length has been read.
       *
       * @param {Function} cb Callback
       * @private
       */
      haveLength(cb) {
        if (this._payloadLength && this._opcode < 8) {
          this._totalPayloadLength += this._payloadLength;
          if (this._totalPayloadLength > this._maxPayload && this._maxPayload > 0) {
            const error = this.createError(
              RangeError,
              "Max payload size exceeded",
              false,
              1009,
              "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH"
            );
            cb(error);
            return;
          }
        }
        if (this._masked) this._state = GET_MASK;
        else this._state = GET_DATA;
      }
      /**
       * Reads mask bytes.
       *
       * @private
       */
      getMask() {
        if (this._bufferedBytes < 4) {
          this._loop = false;
          return;
        }
        this._mask = this.consume(4);
        this._state = GET_DATA;
      }
      /**
       * Reads data bytes.
       *
       * @param {Function} cb Callback
       * @private
       */
      getData(cb) {
        let data = EMPTY_BUFFER;
        if (this._payloadLength) {
          if (this._bufferedBytes < this._payloadLength) {
            this._loop = false;
            return;
          }
          data = this.consume(this._payloadLength);
          if (this._masked && (this._mask[0] | this._mask[1] | this._mask[2] | this._mask[3]) !== 0) {
            unmask(data, this._mask);
          }
        }
        if (this._opcode > 7) {
          this.controlMessage(data, cb);
          return;
        }
        if (this._maxFragments > 0 && ++this._numFragments > this._maxFragments) {
          const error = this.createError(
            RangeError,
            "Too many message fragments",
            false,
            1008,
            "WS_ERR_TOO_MANY_BUFFERED_PARTS"
          );
          cb(error);
          return;
        }
        if (this._compressed) {
          this._state = INFLATING;
          this.decompress(data, cb);
          return;
        }
        if (data.length) {
          this._messageLength = this._totalPayloadLength;
          this._fragments.push(data);
        }
        this.dataMessage(cb);
      }
      /**
       * Decompresses data.
       *
       * @param {Buffer} data Compressed data
       * @param {Function} cb Callback
       * @private
       */
      decompress(data, cb) {
        const perMessageDeflate = this._extensions[PerMessageDeflate2.extensionName];
        perMessageDeflate.decompress(data, this._fin, (err, buf) => {
          if (err) return cb(err);
          if (buf.length) {
            this._messageLength += buf.length;
            if (this._messageLength > this._maxPayload && this._maxPayload > 0) {
              const error = this.createError(
                RangeError,
                "Max payload size exceeded",
                false,
                1009,
                "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH"
              );
              cb(error);
              return;
            }
            this._fragments.push(buf);
          }
          this.dataMessage(cb);
          if (this._state === GET_INFO) this.startLoop(cb);
        });
      }
      /**
       * Handles a data message.
       *
       * @param {Function} cb Callback
       * @private
       */
      dataMessage(cb) {
        if (!this._fin) {
          this._state = GET_INFO;
          return;
        }
        const messageLength = this._messageLength;
        const fragments = this._fragments;
        this._totalPayloadLength = 0;
        this._messageLength = 0;
        this._fragmented = 0;
        this._numFragments = 0;
        this._fragments = [];
        if (this._opcode === 2) {
          let data;
          if (this._binaryType === "nodebuffer") {
            data = concat(fragments, messageLength);
          } else if (this._binaryType === "arraybuffer") {
            data = toArrayBuffer(concat(fragments, messageLength));
          } else if (this._binaryType === "blob") {
            data = new Blob(fragments);
          } else {
            data = fragments;
          }
          if (this._allowSynchronousEvents) {
            this.emit("message", data, true);
            this._state = GET_INFO;
          } else {
            this._state = DEFER_EVENT;
            setImmediate(() => {
              this.emit("message", data, true);
              this._state = GET_INFO;
              this.startLoop(cb);
            });
          }
        } else {
          const buf = concat(fragments, messageLength);
          if (!this._skipUTF8Validation && !isValidUTF8(buf)) {
            const error = this.createError(
              Error,
              "invalid UTF-8 sequence",
              true,
              1007,
              "WS_ERR_INVALID_UTF8"
            );
            cb(error);
            return;
          }
          if (this._state === INFLATING || this._allowSynchronousEvents) {
            this.emit("message", buf, false);
            this._state = GET_INFO;
          } else {
            this._state = DEFER_EVENT;
            setImmediate(() => {
              this.emit("message", buf, false);
              this._state = GET_INFO;
              this.startLoop(cb);
            });
          }
        }
      }
      /**
       * Handles a control message.
       *
       * @param {Buffer} data Data to handle
       * @return {(Error|RangeError|undefined)} A possible error
       * @private
       */
      controlMessage(data, cb) {
        if (this._opcode === 8) {
          if (data.length === 0) {
            this._loop = false;
            this.emit("conclude", 1005, EMPTY_BUFFER);
            this.end();
          } else {
            const code = data.readUInt16BE(0);
            if (!isValidStatusCode(code)) {
              const error = this.createError(
                RangeError,
                `invalid status code ${code}`,
                true,
                1002,
                "WS_ERR_INVALID_CLOSE_CODE"
              );
              cb(error);
              return;
            }
            const buf = new FastBuffer(
              data.buffer,
              data.byteOffset + 2,
              data.length - 2
            );
            if (!this._skipUTF8Validation && !isValidUTF8(buf)) {
              const error = this.createError(
                Error,
                "invalid UTF-8 sequence",
                true,
                1007,
                "WS_ERR_INVALID_UTF8"
              );
              cb(error);
              return;
            }
            this._loop = false;
            this.emit("conclude", code, buf);
            this.end();
          }
          this._state = GET_INFO;
          return;
        }
        if (this._allowSynchronousEvents) {
          this.emit(this._opcode === 9 ? "ping" : "pong", data);
          this._state = GET_INFO;
        } else {
          this._state = DEFER_EVENT;
          setImmediate(() => {
            this.emit(this._opcode === 9 ? "ping" : "pong", data);
            this._state = GET_INFO;
            this.startLoop(cb);
          });
        }
      }
      /**
       * Builds an error object.
       *
       * @param {function(new:Error|RangeError)} ErrorCtor The error constructor
       * @param {String} message The error message
       * @param {Boolean} prefix Specifies whether or not to add a default prefix to
       *     `message`
       * @param {Number} statusCode The status code
       * @param {String} errorCode The exposed error code
       * @return {(Error|RangeError)} The error
       * @private
       */
      createError(ErrorCtor, message, prefix, statusCode, errorCode) {
        this._loop = false;
        this._errored = true;
        const err = new ErrorCtor(
          prefix ? `Invalid WebSocket frame: ${message}` : message
        );
        Error.captureStackTrace(err, this.createError);
        err.code = errorCode;
        err[kStatusCode] = statusCode;
        return err;
      }
    };
    module.exports = Receiver2;
  }
});

// node_modules/ws/lib/sender.js
var require_sender = __commonJS({
  "node_modules/ws/lib/sender.js"(exports, module) {
    "use strict";
    var { Duplex } = __require("stream");
    var { randomFillSync } = __require("crypto");
    var {
      types: { isUint8Array }
    } = __require("util");
    var PerMessageDeflate2 = require_permessage_deflate();
    var { EMPTY_BUFFER, kWebSocket, NOOP } = require_constants();
    var { isBlob, isValidStatusCode } = require_validation();
    var { mask: applyMask, toBuffer } = require_buffer_util();
    var kByteLength = Symbol("kByteLength");
    var maskBuffer = Buffer.alloc(4);
    var RANDOM_POOL_SIZE = 8 * 1024;
    var randomPool;
    var randomPoolPointer = RANDOM_POOL_SIZE;
    var DEFAULT = 0;
    var DEFLATING = 1;
    var GET_BLOB_DATA = 2;
    var Sender2 = class _Sender {
      /**
       * Creates a Sender instance.
       *
       * @param {Duplex} socket The connection socket
       * @param {Object} [extensions] An object containing the negotiated extensions
       * @param {Function} [generateMask] The function used to generate the masking
       *     key
       */
      constructor(socket, extensions, generateMask) {
        this._extensions = extensions || {};
        if (generateMask) {
          this._generateMask = generateMask;
          this._maskBuffer = Buffer.alloc(4);
        }
        this._socket = socket;
        this._firstFragment = true;
        this._compress = false;
        this._bufferedBytes = 0;
        this._queue = [];
        this._state = DEFAULT;
        this.onerror = NOOP;
        this[kWebSocket] = void 0;
      }
      /**
       * Frames a piece of data according to the HyBi WebSocket protocol.
       *
       * @param {(Buffer|String)} data The data to frame
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @return {(Buffer|String)[]} The framed data
       * @public
       */
      static frame(data, options) {
        let mask;
        let merge = false;
        let offset = 2;
        let skipMasking = false;
        if (options.mask) {
          mask = options.maskBuffer || maskBuffer;
          if (options.generateMask) {
            options.generateMask(mask);
          } else {
            if (randomPoolPointer === RANDOM_POOL_SIZE) {
              if (randomPool === void 0) {
                randomPool = Buffer.alloc(RANDOM_POOL_SIZE);
              }
              randomFillSync(randomPool, 0, RANDOM_POOL_SIZE);
              randomPoolPointer = 0;
            }
            mask[0] = randomPool[randomPoolPointer++];
            mask[1] = randomPool[randomPoolPointer++];
            mask[2] = randomPool[randomPoolPointer++];
            mask[3] = randomPool[randomPoolPointer++];
          }
          skipMasking = (mask[0] | mask[1] | mask[2] | mask[3]) === 0;
          offset = 6;
        }
        let dataLength;
        if (typeof data === "string") {
          if ((!options.mask || skipMasking) && options[kByteLength] !== void 0) {
            dataLength = options[kByteLength];
          } else {
            data = Buffer.from(data);
            dataLength = data.length;
          }
        } else {
          dataLength = data.length;
          merge = options.mask && options.readOnly && !skipMasking;
        }
        let payloadLength = dataLength;
        if (dataLength >= 65536) {
          offset += 8;
          payloadLength = 127;
        } else if (dataLength > 125) {
          offset += 2;
          payloadLength = 126;
        }
        const target = Buffer.allocUnsafe(merge ? dataLength + offset : offset);
        target[0] = options.fin ? options.opcode | 128 : options.opcode;
        if (options.rsv1) target[0] |= 64;
        target[1] = payloadLength;
        if (payloadLength === 126) {
          target.writeUInt16BE(dataLength, 2);
        } else if (payloadLength === 127) {
          target[2] = target[3] = 0;
          target.writeUIntBE(dataLength, 4, 6);
        }
        if (!options.mask) return [target, data];
        target[1] |= 128;
        target[offset - 4] = mask[0];
        target[offset - 3] = mask[1];
        target[offset - 2] = mask[2];
        target[offset - 1] = mask[3];
        if (skipMasking) return [target, data];
        if (merge) {
          applyMask(data, mask, target, offset, dataLength);
          return [target];
        }
        applyMask(data, mask, data, 0, dataLength);
        return [target, data];
      }
      /**
       * Sends a close message to the other peer.
       *
       * @param {Number} [code] The status code component of the body
       * @param {(String|Buffer)} [data] The message component of the body
       * @param {Boolean} [mask=false] Specifies whether or not to mask the message
       * @param {Function} [cb] Callback
       * @public
       */
      close(code, data, mask, cb) {
        let buf;
        if (code === void 0) {
          buf = EMPTY_BUFFER;
        } else if (typeof code !== "number" || !isValidStatusCode(code)) {
          throw new TypeError("First argument must be a valid error code number");
        } else if (data === void 0 || !data.length) {
          buf = Buffer.allocUnsafe(2);
          buf.writeUInt16BE(code, 0);
        } else {
          const length = Buffer.byteLength(data);
          if (length > 123) {
            throw new RangeError("The message must not be greater than 123 bytes");
          }
          buf = Buffer.allocUnsafe(2 + length);
          buf.writeUInt16BE(code, 0);
          if (typeof data === "string") {
            buf.write(data, 2);
          } else if (isUint8Array(data)) {
            buf.set(data, 2);
          } else {
            throw new TypeError("Second argument must be a string or a Uint8Array");
          }
        }
        const options = {
          [kByteLength]: buf.length,
          fin: true,
          generateMask: this._generateMask,
          mask,
          maskBuffer: this._maskBuffer,
          opcode: 8,
          readOnly: false,
          rsv1: false
        };
        if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, buf, false, options, cb]);
        } else {
          this.sendFrame(_Sender.frame(buf, options), cb);
        }
      }
      /**
       * Sends a ping message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Boolean} [mask=false] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback
       * @public
       */
      ping(data, mask, cb) {
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (byteLength > 125) {
          throw new RangeError("The data size must not be greater than 125 bytes");
        }
        const options = {
          [kByteLength]: byteLength,
          fin: true,
          generateMask: this._generateMask,
          mask,
          maskBuffer: this._maskBuffer,
          opcode: 9,
          readOnly,
          rsv1: false
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, false, options, cb]);
          } else {
            this.getBlobData(data, false, options, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, false, options, cb]);
        } else {
          this.sendFrame(_Sender.frame(data, options), cb);
        }
      }
      /**
       * Sends a pong message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Boolean} [mask=false] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback
       * @public
       */
      pong(data, mask, cb) {
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (byteLength > 125) {
          throw new RangeError("The data size must not be greater than 125 bytes");
        }
        const options = {
          [kByteLength]: byteLength,
          fin: true,
          generateMask: this._generateMask,
          mask,
          maskBuffer: this._maskBuffer,
          opcode: 10,
          readOnly,
          rsv1: false
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, false, options, cb]);
          } else {
            this.getBlobData(data, false, options, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, false, options, cb]);
        } else {
          this.sendFrame(_Sender.frame(data, options), cb);
        }
      }
      /**
       * Sends a data message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Object} options Options object
       * @param {Boolean} [options.binary=false] Specifies whether `data` is binary
       *     or text
       * @param {Boolean} [options.compress=false] Specifies whether or not to
       *     compress `data`
       * @param {Boolean} [options.fin=false] Specifies whether the fragment is the
       *     last one
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Function} [cb] Callback
       * @public
       */
      send(data, options, cb) {
        const perMessageDeflate = this._extensions[PerMessageDeflate2.extensionName];
        let opcode = options.binary ? 2 : 1;
        let rsv1 = options.compress;
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (this._firstFragment) {
          this._firstFragment = false;
          if (rsv1 && perMessageDeflate && perMessageDeflate.params[perMessageDeflate._isServer ? "server_no_context_takeover" : "client_no_context_takeover"]) {
            rsv1 = byteLength >= perMessageDeflate._threshold;
          }
          this._compress = rsv1;
        } else {
          rsv1 = false;
          opcode = 0;
        }
        if (options.fin) this._firstFragment = true;
        const opts = {
          [kByteLength]: byteLength,
          fin: options.fin,
          generateMask: this._generateMask,
          mask: options.mask,
          maskBuffer: this._maskBuffer,
          opcode,
          readOnly,
          rsv1
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, this._compress, opts, cb]);
          } else {
            this.getBlobData(data, this._compress, opts, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, this._compress, opts, cb]);
        } else {
          this.dispatch(data, this._compress, opts, cb);
        }
      }
      /**
       * Gets the contents of a blob as binary data.
       *
       * @param {Blob} blob The blob
       * @param {Boolean} [compress=false] Specifies whether or not to compress
       *     the data
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @param {Function} [cb] Callback
       * @private
       */
      getBlobData(blob, compress, options, cb) {
        this._bufferedBytes += options[kByteLength];
        this._state = GET_BLOB_DATA;
        blob.arrayBuffer().then((arrayBuffer) => {
          if (this._socket.destroyed) {
            const err = new Error(
              "The socket was closed while the blob was being read"
            );
            process.nextTick(callCallbacks, this, err, cb);
            return;
          }
          this._bufferedBytes -= options[kByteLength];
          const data = toBuffer(arrayBuffer);
          if (!compress) {
            this._state = DEFAULT;
            this.sendFrame(_Sender.frame(data, options), cb);
            this.dequeue();
          } else {
            this.dispatch(data, compress, options, cb);
          }
        }).catch((err) => {
          process.nextTick(onError, this, err, cb);
        });
      }
      /**
       * Dispatches a message.
       *
       * @param {(Buffer|String)} data The message to send
       * @param {Boolean} [compress=false] Specifies whether or not to compress
       *     `data`
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @param {Function} [cb] Callback
       * @private
       */
      dispatch(data, compress, options, cb) {
        if (!compress) {
          this.sendFrame(_Sender.frame(data, options), cb);
          return;
        }
        const perMessageDeflate = this._extensions[PerMessageDeflate2.extensionName];
        this._bufferedBytes += options[kByteLength];
        this._state = DEFLATING;
        perMessageDeflate.compress(data, options.fin, (_, buf) => {
          if (this._socket.destroyed) {
            const err = new Error(
              "The socket was closed while data was being compressed"
            );
            callCallbacks(this, err, cb);
            return;
          }
          this._bufferedBytes -= options[kByteLength];
          this._state = DEFAULT;
          options.readOnly = false;
          this.sendFrame(_Sender.frame(buf, options), cb);
          this.dequeue();
        });
      }
      /**
       * Executes queued send operations.
       *
       * @private
       */
      dequeue() {
        while (this._state === DEFAULT && this._queue.length) {
          const params = this._queue.shift();
          this._bufferedBytes -= params[3][kByteLength];
          Reflect.apply(params[0], this, params.slice(1));
        }
      }
      /**
       * Enqueues a send operation.
       *
       * @param {Array} params Send operation parameters.
       * @private
       */
      enqueue(params) {
        this._bufferedBytes += params[3][kByteLength];
        this._queue.push(params);
      }
      /**
       * Sends a frame.
       *
       * @param {(Buffer | String)[]} list The frame to send
       * @param {Function} [cb] Callback
       * @private
       */
      sendFrame(list, cb) {
        if (list.length === 2) {
          this._socket.cork();
          this._socket.write(list[0]);
          this._socket.write(list[1], cb);
          this._socket.uncork();
        } else {
          this._socket.write(list[0], cb);
        }
      }
    };
    module.exports = Sender2;
    function callCallbacks(sender, err, cb) {
      if (typeof cb === "function") cb(err);
      for (let i = 0; i < sender._queue.length; i++) {
        const params = sender._queue[i];
        const callback = params[params.length - 1];
        if (typeof callback === "function") callback(err);
      }
    }
    function onError(sender, err, cb) {
      callCallbacks(sender, err, cb);
      sender.onerror(err);
    }
  }
});

// node_modules/ws/lib/event-target.js
var require_event_target = __commonJS({
  "node_modules/ws/lib/event-target.js"(exports, module) {
    "use strict";
    var { kForOnEventAttribute, kListener } = require_constants();
    var kCode = Symbol("kCode");
    var kData = Symbol("kData");
    var kError = Symbol("kError");
    var kMessage = Symbol("kMessage");
    var kReason = Symbol("kReason");
    var kTarget = Symbol("kTarget");
    var kType = Symbol("kType");
    var kWasClean = Symbol("kWasClean");
    var Event = class {
      /**
       * Create a new `Event`.
       *
       * @param {String} type The name of the event
       * @throws {TypeError} If the `type` argument is not specified
       */
      constructor(type) {
        this[kTarget] = null;
        this[kType] = type;
      }
      /**
       * @type {*}
       */
      get target() {
        return this[kTarget];
      }
      /**
       * @type {String}
       */
      get type() {
        return this[kType];
      }
    };
    Object.defineProperty(Event.prototype, "target", { enumerable: true });
    Object.defineProperty(Event.prototype, "type", { enumerable: true });
    var CloseEvent = class extends Event {
      /**
       * Create a new `CloseEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {Number} [options.code=0] The status code explaining why the
       *     connection was closed
       * @param {String} [options.reason=''] A human-readable string explaining why
       *     the connection was closed
       * @param {Boolean} [options.wasClean=false] Indicates whether or not the
       *     connection was cleanly closed
       */
      constructor(type, options = {}) {
        super(type);
        this[kCode] = options.code === void 0 ? 0 : options.code;
        this[kReason] = options.reason === void 0 ? "" : options.reason;
        this[kWasClean] = options.wasClean === void 0 ? false : options.wasClean;
      }
      /**
       * @type {Number}
       */
      get code() {
        return this[kCode];
      }
      /**
       * @type {String}
       */
      get reason() {
        return this[kReason];
      }
      /**
       * @type {Boolean}
       */
      get wasClean() {
        return this[kWasClean];
      }
    };
    Object.defineProperty(CloseEvent.prototype, "code", { enumerable: true });
    Object.defineProperty(CloseEvent.prototype, "reason", { enumerable: true });
    Object.defineProperty(CloseEvent.prototype, "wasClean", { enumerable: true });
    var ErrorEvent = class extends Event {
      /**
       * Create a new `ErrorEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {*} [options.error=null] The error that generated this event
       * @param {String} [options.message=''] The error message
       */
      constructor(type, options = {}) {
        super(type);
        this[kError] = options.error === void 0 ? null : options.error;
        this[kMessage] = options.message === void 0 ? "" : options.message;
      }
      /**
       * @type {*}
       */
      get error() {
        return this[kError];
      }
      /**
       * @type {String}
       */
      get message() {
        return this[kMessage];
      }
    };
    Object.defineProperty(ErrorEvent.prototype, "error", { enumerable: true });
    Object.defineProperty(ErrorEvent.prototype, "message", { enumerable: true });
    var MessageEvent = class extends Event {
      /**
       * Create a new `MessageEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {*} [options.data=null] The message content
       */
      constructor(type, options = {}) {
        super(type);
        this[kData] = options.data === void 0 ? null : options.data;
      }
      /**
       * @type {*}
       */
      get data() {
        return this[kData];
      }
    };
    Object.defineProperty(MessageEvent.prototype, "data", { enumerable: true });
    var EventTarget = {
      /**
       * Register an event listener.
       *
       * @param {String} type A string representing the event type to listen for
       * @param {(Function|Object)} handler The listener to add
       * @param {Object} [options] An options object specifies characteristics about
       *     the event listener
       * @param {Boolean} [options.once=false] A `Boolean` indicating that the
       *     listener should be invoked at most once after being added. If `true`,
       *     the listener would be automatically removed when invoked.
       * @public
       */
      addEventListener(type, handler, options = {}) {
        for (const listener of this.listeners(type)) {
          if (!options[kForOnEventAttribute] && listener[kListener] === handler && !listener[kForOnEventAttribute]) {
            return;
          }
        }
        let wrapper;
        if (type === "message") {
          wrapper = function onMessage(data, isBinary) {
            const event = new MessageEvent("message", {
              data: isBinary ? data : data.toString()
            });
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else if (type === "close") {
          wrapper = function onClose(code, message) {
            const event = new CloseEvent("close", {
              code,
              reason: message.toString(),
              wasClean: this._closeFrameReceived && this._closeFrameSent
            });
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else if (type === "error") {
          wrapper = function onError(error) {
            const event = new ErrorEvent("error", {
              error,
              message: error.message
            });
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else if (type === "open") {
          wrapper = function onOpen() {
            const event = new Event("open");
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else {
          return;
        }
        wrapper[kForOnEventAttribute] = !!options[kForOnEventAttribute];
        wrapper[kListener] = handler;
        if (options.once) {
          this.once(type, wrapper);
        } else {
          this.on(type, wrapper);
        }
      },
      /**
       * Remove an event listener.
       *
       * @param {String} type A string representing the event type to remove
       * @param {(Function|Object)} handler The listener to remove
       * @public
       */
      removeEventListener(type, handler) {
        for (const listener of this.listeners(type)) {
          if (listener[kListener] === handler && !listener[kForOnEventAttribute]) {
            this.removeListener(type, listener);
            break;
          }
        }
      }
    };
    module.exports = {
      CloseEvent,
      ErrorEvent,
      Event,
      EventTarget,
      MessageEvent
    };
    function callListener(listener, thisArg, event) {
      if (typeof listener === "object" && listener.handleEvent) {
        listener.handleEvent.call(listener, event);
      } else {
        listener.call(thisArg, event);
      }
    }
  }
});

// node_modules/ws/lib/extension.js
var require_extension = __commonJS({
  "node_modules/ws/lib/extension.js"(exports, module) {
    "use strict";
    var { tokenChars } = require_validation();
    function push(dest, name, elem) {
      if (dest[name] === void 0) dest[name] = [elem];
      else dest[name].push(elem);
    }
    function parse(header) {
      const offers = /* @__PURE__ */ Object.create(null);
      let params = /* @__PURE__ */ Object.create(null);
      let mustUnescape = false;
      let isEscaping = false;
      let inQuotes = false;
      let extensionName;
      let paramName;
      let start = -1;
      let code = -1;
      let end = -1;
      let i = 0;
      for (; i < header.length; i++) {
        code = header.charCodeAt(i);
        if (extensionName === void 0) {
          if (end === -1 && tokenChars[code] === 1) {
            if (start === -1) start = i;
          } else if (i !== 0 && (code === 32 || code === 9)) {
            if (end === -1 && start !== -1) end = i;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (end === -1) end = i;
            const name = header.slice(start, end);
            if (code === 44) {
              push(offers, name, params);
              params = /* @__PURE__ */ Object.create(null);
            } else {
              extensionName = name;
            }
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
        } else if (paramName === void 0) {
          if (end === -1 && tokenChars[code] === 1) {
            if (start === -1) start = i;
          } else if (code === 32 || code === 9) {
            if (end === -1 && start !== -1) end = i;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (end === -1) end = i;
            push(params, header.slice(start, end), true);
            if (code === 44) {
              push(offers, extensionName, params);
              params = /* @__PURE__ */ Object.create(null);
              extensionName = void 0;
            }
            start = end = -1;
          } else if (code === 61 && start !== -1 && end === -1) {
            paramName = header.slice(start, i);
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
        } else {
          if (isEscaping) {
            if (tokenChars[code] !== 1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (start === -1) start = i;
            else if (!mustUnescape) mustUnescape = true;
            isEscaping = false;
          } else if (inQuotes) {
            if (tokenChars[code] === 1) {
              if (start === -1) start = i;
            } else if (code === 34 && start !== -1) {
              inQuotes = false;
              end = i;
            } else if (code === 92) {
              isEscaping = true;
            } else {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
          } else if (code === 34 && header.charCodeAt(i - 1) === 61) {
            inQuotes = true;
          } else if (end === -1 && tokenChars[code] === 1) {
            if (start === -1) start = i;
          } else if (start !== -1 && (code === 32 || code === 9)) {
            if (end === -1) end = i;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (end === -1) end = i;
            let value = header.slice(start, end);
            if (mustUnescape) {
              value = value.replace(/\\/g, "");
              mustUnescape = false;
            }
            push(params, paramName, value);
            if (code === 44) {
              push(offers, extensionName, params);
              params = /* @__PURE__ */ Object.create(null);
              extensionName = void 0;
            }
            paramName = void 0;
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
        }
      }
      if (start === -1 || inQuotes || code === 32 || code === 9) {
        throw new SyntaxError("Unexpected end of input");
      }
      if (end === -1) end = i;
      const token = header.slice(start, end);
      if (extensionName === void 0) {
        push(offers, token, params);
      } else {
        if (paramName === void 0) {
          push(params, token, true);
        } else if (mustUnescape) {
          push(params, paramName, token.replace(/\\/g, ""));
        } else {
          push(params, paramName, token);
        }
        push(offers, extensionName, params);
      }
      return offers;
    }
    function format(extensions) {
      return Object.keys(extensions).map((extension2) => {
        let configurations = extensions[extension2];
        if (!Array.isArray(configurations)) configurations = [configurations];
        return configurations.map((params) => {
          return [extension2].concat(
            Object.keys(params).map((k) => {
              let values = params[k];
              if (!Array.isArray(values)) values = [values];
              return values.map((v) => v === true ? k : `${k}=${v}`).join("; ");
            })
          ).join("; ");
        }).join(", ");
      }).join(", ");
    }
    module.exports = { format, parse };
  }
});

// node_modules/ws/lib/websocket.js
var require_websocket = __commonJS({
  "node_modules/ws/lib/websocket.js"(exports, module) {
    "use strict";
    var EventEmitter = __require("events");
    var https = __require("https");
    var http = __require("http");
    var net = __require("net");
    var tls = __require("tls");
    var { randomBytes, createHash } = __require("crypto");
    var { Duplex, Readable } = __require("stream");
    var { URL } = __require("url");
    var PerMessageDeflate2 = require_permessage_deflate();
    var Receiver2 = require_receiver();
    var Sender2 = require_sender();
    var { isBlob } = require_validation();
    var {
      BINARY_TYPES,
      CLOSE_TIMEOUT,
      EMPTY_BUFFER,
      GUID,
      kForOnEventAttribute,
      kListener,
      kStatusCode,
      kWebSocket,
      NOOP
    } = require_constants();
    var {
      EventTarget: { addEventListener, removeEventListener }
    } = require_event_target();
    var { format, parse } = require_extension();
    var { toBuffer } = require_buffer_util();
    var kAborted = Symbol("kAborted");
    var protocolVersions = [8, 13];
    var readyStates = ["CONNECTING", "OPEN", "CLOSING", "CLOSED"];
    var subprotocolRegex = /^[!#$%&'*+\-.0-9A-Z^_`|a-z~]+$/;
    var WebSocket2 = class _WebSocket extends EventEmitter {
      /**
       * Create a new `WebSocket`.
       *
       * @param {(String|URL)} address The URL to which to connect
       * @param {(String|String[])} [protocols] The subprotocols
       * @param {Object} [options] Connection options
       */
      constructor(address, protocols, options) {
        super();
        this._binaryType = BINARY_TYPES[0];
        this._closeCode = 1006;
        this._closeFrameReceived = false;
        this._closeFrameSent = false;
        this._closeMessage = EMPTY_BUFFER;
        this._closeTimer = null;
        this._errorEmitted = false;
        this._extensions = {};
        this._paused = false;
        this._protocol = "";
        this._readyState = _WebSocket.CONNECTING;
        this._receiver = null;
        this._sender = null;
        this._socket = null;
        if (address !== null) {
          this._bufferedAmount = 0;
          this._isServer = false;
          this._redirects = 0;
          if (protocols === void 0) {
            protocols = [];
          } else if (!Array.isArray(protocols)) {
            if (typeof protocols === "object" && protocols !== null) {
              options = protocols;
              protocols = [];
            } else {
              protocols = [protocols];
            }
          }
          initAsClient(this, address, protocols, options);
        } else {
          this._autoPong = options.autoPong;
          this._closeTimeout = options.closeTimeout;
          this._isServer = true;
        }
      }
      /**
       * For historical reasons, the custom "nodebuffer" type is used by the default
       * instead of "blob".
       *
       * @type {String}
       */
      get binaryType() {
        return this._binaryType;
      }
      set binaryType(type) {
        if (!BINARY_TYPES.includes(type)) return;
        this._binaryType = type;
        if (this._receiver) this._receiver._binaryType = type;
      }
      /**
       * @type {Number}
       */
      get bufferedAmount() {
        if (!this._socket) return this._bufferedAmount;
        return this._socket._writableState.length + this._sender._bufferedBytes;
      }
      /**
       * @type {String}
       */
      get extensions() {
        return Object.keys(this._extensions).join();
      }
      /**
       * @type {Boolean}
       */
      get isPaused() {
        return this._paused;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onclose() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onerror() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onopen() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onmessage() {
        return null;
      }
      /**
       * @type {String}
       */
      get protocol() {
        return this._protocol;
      }
      /**
       * @type {Number}
       */
      get readyState() {
        return this._readyState;
      }
      /**
       * @type {String}
       */
      get url() {
        return this._url;
      }
      /**
       * Set up the socket and the internal resources.
       *
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Object} options Options object
       * @param {Boolean} [options.allowSynchronousEvents=false] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Number} [options.maxBufferedChunks=0] The maximum number of
       *     buffered data chunks
       * @param {Number} [options.maxFragments=0] The maximum number of message
       *     fragments
       * @param {Number} [options.maxPayload=0] The maximum allowed message size
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       * @private
       */
      setSocket(socket, head, options) {
        const receiver = new Receiver2({
          allowSynchronousEvents: options.allowSynchronousEvents,
          binaryType: this.binaryType,
          extensions: this._extensions,
          isServer: this._isServer,
          maxBufferedChunks: options.maxBufferedChunks,
          maxFragments: options.maxFragments,
          maxPayload: options.maxPayload,
          skipUTF8Validation: options.skipUTF8Validation
        });
        const sender = new Sender2(socket, this._extensions, options.generateMask);
        this._receiver = receiver;
        this._sender = sender;
        this._socket = socket;
        receiver[kWebSocket] = this;
        sender[kWebSocket] = this;
        socket[kWebSocket] = this;
        receiver.on("conclude", receiverOnConclude);
        receiver.on("drain", receiverOnDrain);
        receiver.on("error", receiverOnError);
        receiver.on("message", receiverOnMessage);
        receiver.on("ping", receiverOnPing);
        receiver.on("pong", receiverOnPong);
        sender.onerror = senderOnError;
        if (socket.setTimeout) socket.setTimeout(0);
        if (socket.setNoDelay) socket.setNoDelay();
        if (head.length > 0) socket.unshift(head);
        socket.on("close", socketOnClose);
        socket.on("data", socketOnData);
        socket.on("end", socketOnEnd);
        socket.on("error", socketOnError);
        this._readyState = _WebSocket.OPEN;
        this.emit("open");
      }
      /**
       * Emit the `'close'` event.
       *
       * @private
       */
      emitClose() {
        if (!this._socket) {
          this._readyState = _WebSocket.CLOSED;
          this.emit("close", this._closeCode, this._closeMessage);
          return;
        }
        if (this._extensions[PerMessageDeflate2.extensionName]) {
          this._extensions[PerMessageDeflate2.extensionName].cleanup();
        }
        this._receiver.removeAllListeners();
        this._readyState = _WebSocket.CLOSED;
        this.emit("close", this._closeCode, this._closeMessage);
      }
      /**
       * Start a closing handshake.
       *
       *          +----------+   +-----------+   +----------+
       *     - - -|ws.close()|-->|close frame|-->|ws.close()|- - -
       *    |     +----------+   +-----------+   +----------+     |
       *          +----------+   +-----------+         |
       * CLOSING  |ws.close()|<--|close frame|<--+-----+       CLOSING
       *          +----------+   +-----------+   |
       *    |           |                        |   +---+        |
       *                +------------------------+-->|fin| - - - -
       *    |         +---+                      |   +---+
       *     - - - - -|fin|<---------------------+
       *              +---+
       *
       * @param {Number} [code] Status code explaining why the connection is closing
       * @param {(String|Buffer)} [data] The reason why the connection is
       *     closing
       * @public
       */
      close(code, data) {
        if (this.readyState === _WebSocket.CLOSED) return;
        if (this.readyState === _WebSocket.CONNECTING) {
          const msg = "WebSocket was closed before the connection was established";
          abortHandshake(this, this._req, msg);
          return;
        }
        if (this.readyState === _WebSocket.CLOSING) {
          if (this._closeFrameSent && (this._closeFrameReceived || this._receiver._writableState.errorEmitted)) {
            this._socket.end();
          }
          return;
        }
        this._readyState = _WebSocket.CLOSING;
        this._sender.close(code, data, !this._isServer, (err) => {
          if (err) return;
          this._closeFrameSent = true;
          if (this._closeFrameReceived || this._receiver._writableState.errorEmitted) {
            this._socket.end();
          }
        });
        setCloseTimer(this);
      }
      /**
       * Pause the socket.
       *
       * @public
       */
      pause() {
        if (this.readyState === _WebSocket.CONNECTING || this.readyState === _WebSocket.CLOSED) {
          return;
        }
        this._paused = true;
        this._socket.pause();
      }
      /**
       * Send a ping.
       *
       * @param {*} [data] The data to send
       * @param {Boolean} [mask] Indicates whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when the ping is sent
       * @public
       */
      ping(data, mask, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof data === "function") {
          cb = data;
          data = mask = void 0;
        } else if (typeof mask === "function") {
          cb = mask;
          mask = void 0;
        }
        if (typeof data === "number") data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        if (mask === void 0) mask = !this._isServer;
        this._sender.ping(data || EMPTY_BUFFER, mask, cb);
      }
      /**
       * Send a pong.
       *
       * @param {*} [data] The data to send
       * @param {Boolean} [mask] Indicates whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when the pong is sent
       * @public
       */
      pong(data, mask, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof data === "function") {
          cb = data;
          data = mask = void 0;
        } else if (typeof mask === "function") {
          cb = mask;
          mask = void 0;
        }
        if (typeof data === "number") data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        if (mask === void 0) mask = !this._isServer;
        this._sender.pong(data || EMPTY_BUFFER, mask, cb);
      }
      /**
       * Resume the socket.
       *
       * @public
       */
      resume() {
        if (this.readyState === _WebSocket.CONNECTING || this.readyState === _WebSocket.CLOSED) {
          return;
        }
        this._paused = false;
        if (!this._receiver._writableState.needDrain) this._socket.resume();
      }
      /**
       * Send a data message.
       *
       * @param {*} data The message to send
       * @param {Object} [options] Options object
       * @param {Boolean} [options.binary] Specifies whether `data` is binary or
       *     text
       * @param {Boolean} [options.compress] Specifies whether or not to compress
       *     `data`
       * @param {Boolean} [options.fin=true] Specifies whether the fragment is the
       *     last one
       * @param {Boolean} [options.mask] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when data is written out
       * @public
       */
      send(data, options, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof options === "function") {
          cb = options;
          options = {};
        }
        if (typeof data === "number") data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        const opts = {
          binary: typeof data !== "string",
          mask: !this._isServer,
          compress: true,
          fin: true,
          ...options
        };
        if (!this._extensions[PerMessageDeflate2.extensionName]) {
          opts.compress = false;
        }
        this._sender.send(data || EMPTY_BUFFER, opts, cb);
      }
      /**
       * Forcibly close the connection.
       *
       * @public
       */
      terminate() {
        if (this.readyState === _WebSocket.CLOSED) return;
        if (this.readyState === _WebSocket.CONNECTING) {
          const msg = "WebSocket was closed before the connection was established";
          abortHandshake(this, this._req, msg);
          return;
        }
        if (this._socket) {
          this._readyState = _WebSocket.CLOSING;
          this._socket.destroy();
        }
      }
    };
    Object.defineProperty(WebSocket2, "CONNECTING", {
      enumerable: true,
      value: readyStates.indexOf("CONNECTING")
    });
    Object.defineProperty(WebSocket2.prototype, "CONNECTING", {
      enumerable: true,
      value: readyStates.indexOf("CONNECTING")
    });
    Object.defineProperty(WebSocket2, "OPEN", {
      enumerable: true,
      value: readyStates.indexOf("OPEN")
    });
    Object.defineProperty(WebSocket2.prototype, "OPEN", {
      enumerable: true,
      value: readyStates.indexOf("OPEN")
    });
    Object.defineProperty(WebSocket2, "CLOSING", {
      enumerable: true,
      value: readyStates.indexOf("CLOSING")
    });
    Object.defineProperty(WebSocket2.prototype, "CLOSING", {
      enumerable: true,
      value: readyStates.indexOf("CLOSING")
    });
    Object.defineProperty(WebSocket2, "CLOSED", {
      enumerable: true,
      value: readyStates.indexOf("CLOSED")
    });
    Object.defineProperty(WebSocket2.prototype, "CLOSED", {
      enumerable: true,
      value: readyStates.indexOf("CLOSED")
    });
    [
      "binaryType",
      "bufferedAmount",
      "extensions",
      "isPaused",
      "protocol",
      "readyState",
      "url"
    ].forEach((property) => {
      Object.defineProperty(WebSocket2.prototype, property, { enumerable: true });
    });
    ["open", "error", "close", "message"].forEach((method) => {
      Object.defineProperty(WebSocket2.prototype, `on${method}`, {
        enumerable: true,
        get() {
          for (const listener of this.listeners(method)) {
            if (listener[kForOnEventAttribute]) return listener[kListener];
          }
          return null;
        },
        set(handler) {
          for (const listener of this.listeners(method)) {
            if (listener[kForOnEventAttribute]) {
              this.removeListener(method, listener);
              break;
            }
          }
          if (typeof handler !== "function") return;
          this.addEventListener(method, handler, {
            [kForOnEventAttribute]: true
          });
        }
      });
    });
    WebSocket2.prototype.addEventListener = addEventListener;
    WebSocket2.prototype.removeEventListener = removeEventListener;
    module.exports = WebSocket2;
    function initAsClient(websocket, address, protocols, options) {
      const opts = {
        allowSynchronousEvents: true,
        autoPong: true,
        closeTimeout: CLOSE_TIMEOUT,
        protocolVersion: protocolVersions[1],
        maxBufferedChunks: 256 * 1024,
        maxFragments: 16 * 1024,
        maxPayload: 100 * 1024 * 1024,
        skipUTF8Validation: false,
        perMessageDeflate: true,
        followRedirects: false,
        maxRedirects: 10,
        ...options,
        socketPath: void 0,
        hostname: void 0,
        protocol: void 0,
        timeout: void 0,
        method: "GET",
        host: void 0,
        path: void 0,
        port: void 0
      };
      websocket._autoPong = opts.autoPong;
      websocket._closeTimeout = opts.closeTimeout;
      if (!protocolVersions.includes(opts.protocolVersion)) {
        throw new RangeError(
          `Unsupported protocol version: ${opts.protocolVersion} (supported versions: ${protocolVersions.join(", ")})`
        );
      }
      let parsedUrl;
      if (address instanceof URL) {
        parsedUrl = address;
      } else {
        try {
          parsedUrl = new URL(address);
        } catch {
          throw new SyntaxError(`Invalid URL: ${address}`);
        }
      }
      if (parsedUrl.protocol === "http:") {
        parsedUrl.protocol = "ws:";
      } else if (parsedUrl.protocol === "https:") {
        parsedUrl.protocol = "wss:";
      }
      websocket._url = parsedUrl.href;
      const isSecure = parsedUrl.protocol === "wss:";
      const isIpcUrl = parsedUrl.protocol === "ws+unix:";
      let invalidUrlMessage;
      if (parsedUrl.protocol !== "ws:" && !isSecure && !isIpcUrl) {
        invalidUrlMessage = `The URL's protocol must be one of "ws:", "wss:", "http:", "https:", or "ws+unix:"`;
      } else if (isIpcUrl && !parsedUrl.pathname) {
        invalidUrlMessage = "The URL's pathname is empty";
      } else if (parsedUrl.hash) {
        invalidUrlMessage = "The URL contains a fragment identifier";
      }
      if (invalidUrlMessage) {
        const err = new SyntaxError(invalidUrlMessage);
        if (websocket._redirects === 0) {
          throw err;
        } else {
          emitErrorAndClose(websocket, err);
          return;
        }
      }
      const defaultPort = isSecure ? 443 : 80;
      const key = randomBytes(16).toString("base64");
      const request = isSecure ? https.request : http.request;
      const protocolSet = /* @__PURE__ */ new Set();
      let perMessageDeflate;
      opts.createConnection = opts.createConnection || (isSecure ? tlsConnect : netConnect);
      opts.defaultPort = opts.defaultPort || defaultPort;
      opts.port = parsedUrl.port || defaultPort;
      opts.host = parsedUrl.hostname.startsWith("[") ? parsedUrl.hostname.slice(1, -1) : parsedUrl.hostname;
      opts.headers = {
        ...opts.headers,
        "Sec-WebSocket-Version": opts.protocolVersion,
        "Sec-WebSocket-Key": key,
        Connection: "Upgrade",
        Upgrade: "websocket"
      };
      opts.path = parsedUrl.pathname + parsedUrl.search;
      opts.timeout = opts.handshakeTimeout;
      if (opts.perMessageDeflate) {
        perMessageDeflate = new PerMessageDeflate2({
          ...opts.perMessageDeflate,
          isServer: false,
          maxPayload: opts.maxPayload
        });
        opts.headers["Sec-WebSocket-Extensions"] = format({
          [PerMessageDeflate2.extensionName]: perMessageDeflate.offer()
        });
      }
      if (protocols.length) {
        for (const protocol of protocols) {
          if (typeof protocol !== "string" || !subprotocolRegex.test(protocol) || protocolSet.has(protocol)) {
            throw new SyntaxError(
              "An invalid or duplicated subprotocol was specified"
            );
          }
          protocolSet.add(protocol);
        }
        opts.headers["Sec-WebSocket-Protocol"] = protocols.join(",");
      }
      if (opts.origin) {
        if (opts.protocolVersion < 13) {
          opts.headers["Sec-WebSocket-Origin"] = opts.origin;
        } else {
          opts.headers.Origin = opts.origin;
        }
      }
      if (parsedUrl.username || parsedUrl.password) {
        opts.auth = `${parsedUrl.username}:${parsedUrl.password}`;
      }
      if (isIpcUrl) {
        const parts = opts.path.split(":");
        opts.socketPath = parts[0];
        opts.path = parts[1];
      }
      let req;
      if (opts.followRedirects) {
        if (websocket._redirects === 0) {
          websocket._originalIpc = isIpcUrl;
          websocket._originalSecure = isSecure;
          websocket._originalHostOrSocketPath = isIpcUrl ? opts.socketPath : parsedUrl.host;
          const headers = options && options.headers;
          options = { ...options, headers: {} };
          if (headers) {
            for (const [key2, value] of Object.entries(headers)) {
              options.headers[key2.toLowerCase()] = value;
            }
          }
        } else if (websocket.listenerCount("redirect") === 0) {
          const isSameHost = isIpcUrl ? websocket._originalIpc ? opts.socketPath === websocket._originalHostOrSocketPath : false : websocket._originalIpc ? false : parsedUrl.host === websocket._originalHostOrSocketPath;
          if (!isSameHost || websocket._originalSecure && !isSecure) {
            delete opts.headers.authorization;
            delete opts.headers.cookie;
            if (!isSameHost) delete opts.headers.host;
            opts.auth = void 0;
          }
        }
        if (opts.auth && !options.headers.authorization) {
          options.headers.authorization = "Basic " + Buffer.from(opts.auth).toString("base64");
        }
        req = websocket._req = request(opts);
        if (websocket._redirects) {
          websocket.emit("redirect", websocket.url, req);
        }
      } else {
        req = websocket._req = request(opts);
      }
      if (opts.timeout) {
        req.on("timeout", () => {
          abortHandshake(websocket, req, "Opening handshake has timed out");
        });
      }
      req.on("error", (err) => {
        if (req === null || req[kAborted]) return;
        req = websocket._req = null;
        emitErrorAndClose(websocket, err);
      });
      req.on("response", (res) => {
        const location = res.headers.location;
        const statusCode = res.statusCode;
        if (location && opts.followRedirects && statusCode >= 300 && statusCode < 400) {
          if (++websocket._redirects > opts.maxRedirects) {
            abortHandshake(websocket, req, "Maximum redirects exceeded");
            return;
          }
          req.abort();
          let addr;
          try {
            addr = new URL(location, address);
          } catch (e) {
            const err = new SyntaxError(`Invalid URL: ${location}`);
            emitErrorAndClose(websocket, err);
            return;
          }
          initAsClient(websocket, addr, protocols, options);
        } else if (!websocket.emit("unexpected-response", req, res)) {
          abortHandshake(
            websocket,
            req,
            `Unexpected server response: ${res.statusCode}`
          );
        }
      });
      req.on("upgrade", (res, socket, head) => {
        websocket.emit("upgrade", res);
        if (websocket.readyState !== WebSocket2.CONNECTING) return;
        req = websocket._req = null;
        const upgrade = res.headers.upgrade;
        if (upgrade === void 0 || upgrade.toLowerCase() !== "websocket") {
          abortHandshake(websocket, socket, "Invalid Upgrade header");
          return;
        }
        const digest = createHash("sha1").update(key + GUID).digest("base64");
        if (res.headers["sec-websocket-accept"] !== digest) {
          abortHandshake(websocket, socket, "Invalid Sec-WebSocket-Accept header");
          return;
        }
        const serverProt = res.headers["sec-websocket-protocol"];
        let protError;
        if (serverProt !== void 0) {
          if (!protocolSet.size) {
            protError = "Server sent a subprotocol but none was requested";
          } else if (!protocolSet.has(serverProt)) {
            protError = "Server sent an invalid subprotocol";
          }
        } else if (protocolSet.size) {
          protError = "Server sent no subprotocol";
        }
        if (protError) {
          abortHandshake(websocket, socket, protError);
          return;
        }
        if (serverProt) websocket._protocol = serverProt;
        const secWebSocketExtensions = res.headers["sec-websocket-extensions"];
        if (secWebSocketExtensions !== void 0) {
          if (!perMessageDeflate) {
            const message = "Server sent a Sec-WebSocket-Extensions header but no extension was requested";
            abortHandshake(websocket, socket, message);
            return;
          }
          let extensions;
          try {
            extensions = parse(secWebSocketExtensions);
          } catch (err) {
            const message = "Invalid Sec-WebSocket-Extensions header";
            abortHandshake(websocket, socket, message);
            return;
          }
          const extensionNames = Object.keys(extensions);
          if (extensionNames.length !== 1 || extensionNames[0] !== PerMessageDeflate2.extensionName) {
            const message = "Server indicated an extension that was not requested";
            abortHandshake(websocket, socket, message);
            return;
          }
          try {
            perMessageDeflate.accept(extensions[PerMessageDeflate2.extensionName]);
          } catch (err) {
            const message = "Invalid Sec-WebSocket-Extensions header";
            abortHandshake(websocket, socket, message);
            return;
          }
          websocket._extensions[PerMessageDeflate2.extensionName] = perMessageDeflate;
        }
        websocket.setSocket(socket, head, {
          allowSynchronousEvents: opts.allowSynchronousEvents,
          generateMask: opts.generateMask,
          maxBufferedChunks: opts.maxBufferedChunks,
          maxFragments: opts.maxFragments,
          maxPayload: opts.maxPayload,
          skipUTF8Validation: opts.skipUTF8Validation
        });
      });
      if (opts.finishRequest) {
        opts.finishRequest(req, websocket);
      } else {
        req.end();
      }
    }
    function emitErrorAndClose(websocket, err) {
      websocket._readyState = WebSocket2.CLOSING;
      websocket._errorEmitted = true;
      websocket.emit("error", err);
      websocket.emitClose();
    }
    function netConnect(options) {
      options.path = options.socketPath;
      return net.connect(options);
    }
    function tlsConnect(options) {
      options.path = void 0;
      if (!options.servername && options.servername !== "") {
        options.servername = net.isIP(options.host) ? "" : options.host;
      }
      return tls.connect(options);
    }
    function abortHandshake(websocket, stream, message) {
      websocket._readyState = WebSocket2.CLOSING;
      const err = new Error(message);
      Error.captureStackTrace(err, abortHandshake);
      if (stream.setHeader) {
        stream[kAborted] = true;
        stream.abort();
        if (stream.socket && !stream.socket.destroyed) {
          stream.socket.destroy();
        }
        process.nextTick(emitErrorAndClose, websocket, err);
      } else {
        stream.destroy(err);
        stream.once("error", websocket.emit.bind(websocket, "error"));
        stream.once("close", websocket.emitClose.bind(websocket));
      }
    }
    function sendAfterClose(websocket, data, cb) {
      if (data) {
        const length = isBlob(data) ? data.size : toBuffer(data).length;
        if (websocket._socket) websocket._sender._bufferedBytes += length;
        else websocket._bufferedAmount += length;
      }
      if (cb) {
        const err = new Error(
          `WebSocket is not open: readyState ${websocket.readyState} (${readyStates[websocket.readyState]})`
        );
        process.nextTick(cb, err);
      }
    }
    function receiverOnConclude(code, reason) {
      const websocket = this[kWebSocket];
      websocket._closeFrameReceived = true;
      websocket._closeMessage = reason;
      websocket._closeCode = code;
      if (websocket._socket[kWebSocket] === void 0) return;
      websocket._socket.removeListener("data", socketOnData);
      process.nextTick(resume, websocket._socket);
      if (code === 1005) websocket.close();
      else websocket.close(code, reason);
    }
    function receiverOnDrain() {
      const websocket = this[kWebSocket];
      if (!websocket.isPaused) websocket._socket.resume();
    }
    function receiverOnError(err) {
      const websocket = this[kWebSocket];
      if (websocket._socket[kWebSocket] !== void 0) {
        websocket._socket.removeListener("data", socketOnData);
        process.nextTick(resume, websocket._socket);
        websocket.close(err[kStatusCode]);
      }
      if (!websocket._errorEmitted) {
        websocket._errorEmitted = true;
        websocket.emit("error", err);
      }
    }
    function receiverOnFinish() {
      this[kWebSocket].emitClose();
    }
    function receiverOnMessage(data, isBinary) {
      this[kWebSocket].emit("message", data, isBinary);
    }
    function receiverOnPing(data) {
      const websocket = this[kWebSocket];
      if (websocket._autoPong) websocket.pong(data, !this._isServer, NOOP);
      websocket.emit("ping", data);
    }
    function receiverOnPong(data) {
      this[kWebSocket].emit("pong", data);
    }
    function resume(stream) {
      stream.resume();
    }
    function senderOnError(err) {
      const websocket = this[kWebSocket];
      if (websocket.readyState === WebSocket2.CLOSED) return;
      if (websocket.readyState === WebSocket2.OPEN) {
        websocket._readyState = WebSocket2.CLOSING;
        setCloseTimer(websocket);
      }
      this._socket.end();
      if (!websocket._errorEmitted) {
        websocket._errorEmitted = true;
        websocket.emit("error", err);
      }
    }
    function setCloseTimer(websocket) {
      websocket._closeTimer = setTimeout(
        websocket._socket.destroy.bind(websocket._socket),
        websocket._closeTimeout
      );
    }
    function socketOnClose() {
      const websocket = this[kWebSocket];
      this.removeListener("close", socketOnClose);
      this.removeListener("data", socketOnData);
      this.removeListener("end", socketOnEnd);
      websocket._readyState = WebSocket2.CLOSING;
      if (!this._readableState.endEmitted && !websocket._closeFrameReceived && !websocket._receiver._writableState.errorEmitted && this._readableState.length !== 0) {
        const chunk = this.read(this._readableState.length);
        websocket._receiver.write(chunk);
      }
      websocket._receiver.end();
      this[kWebSocket] = void 0;
      clearTimeout(websocket._closeTimer);
      if (websocket._receiver._writableState.finished || websocket._receiver._writableState.errorEmitted) {
        websocket.emitClose();
      } else {
        websocket._receiver.on("error", receiverOnFinish);
        websocket._receiver.on("finish", receiverOnFinish);
      }
    }
    function socketOnData(chunk) {
      if (!this[kWebSocket]._receiver.write(chunk)) {
        this.pause();
      }
    }
    function socketOnEnd() {
      const websocket = this[kWebSocket];
      websocket._readyState = WebSocket2.CLOSING;
      websocket._receiver.end();
      this.end();
    }
    function socketOnError() {
      const websocket = this[kWebSocket];
      this.removeListener("error", socketOnError);
      this.on("error", NOOP);
      if (websocket) {
        websocket._readyState = WebSocket2.CLOSING;
        this.destroy();
      }
    }
  }
});

// node_modules/ws/lib/stream.js
var require_stream = __commonJS({
  "node_modules/ws/lib/stream.js"(exports, module) {
    "use strict";
    var WebSocket2 = require_websocket();
    var { Duplex } = __require("stream");
    function emitClose(stream) {
      stream.emit("close");
    }
    function duplexOnEnd() {
      if (!this.destroyed && this._writableState.finished) {
        this.destroy();
      }
    }
    function duplexOnError(err) {
      this.removeListener("error", duplexOnError);
      this.destroy();
      if (this.listenerCount("error") === 0) {
        this.emit("error", err);
      }
    }
    function createWebSocketStream2(ws2, options) {
      let terminateOnDestroy = true;
      const duplex = new Duplex({
        ...options,
        autoDestroy: false,
        emitClose: false,
        objectMode: false,
        writableObjectMode: false
      });
      ws2.on("message", function message(msg, isBinary) {
        const data = !isBinary && duplex._readableState.objectMode ? msg.toString() : msg;
        if (!duplex.push(data)) ws2.pause();
      });
      ws2.once("error", function error(err) {
        if (duplex.destroyed) return;
        terminateOnDestroy = false;
        duplex.destroy(err);
      });
      ws2.once("close", function close() {
        if (duplex.destroyed) return;
        duplex.push(null);
      });
      duplex._destroy = function(err, callback) {
        if (ws2.readyState === ws2.CLOSED) {
          callback(err);
          process.nextTick(emitClose, duplex);
          return;
        }
        let called = false;
        ws2.once("error", function error(err2) {
          called = true;
          callback(err2);
        });
        ws2.once("close", function close() {
          if (!called) callback(err);
          process.nextTick(emitClose, duplex);
        });
        if (terminateOnDestroy) ws2.terminate();
      };
      duplex._final = function(callback) {
        if (ws2.readyState === ws2.CONNECTING) {
          ws2.once("open", function open() {
            duplex._final(callback);
          });
          return;
        }
        if (ws2._socket === null) return;
        if (ws2._socket._writableState.finished) {
          callback();
          if (duplex._readableState.endEmitted) duplex.destroy();
        } else {
          ws2._socket.once("finish", function finish() {
            callback();
          });
          ws2.close();
        }
      };
      duplex._read = function() {
        if (ws2.isPaused) ws2.resume();
      };
      duplex._write = function(chunk, encoding, callback) {
        if (ws2.readyState === ws2.CONNECTING) {
          ws2.once("open", function open() {
            duplex._write(chunk, encoding, callback);
          });
          return;
        }
        ws2.send(chunk, callback);
      };
      duplex.on("end", duplexOnEnd);
      duplex.on("error", duplexOnError);
      return duplex;
    }
    module.exports = createWebSocketStream2;
  }
});

// node_modules/ws/lib/subprotocol.js
var require_subprotocol = __commonJS({
  "node_modules/ws/lib/subprotocol.js"(exports, module) {
    "use strict";
    var { tokenChars } = require_validation();
    function parse(header) {
      const protocols = /* @__PURE__ */ new Set();
      let start = -1;
      let end = -1;
      let i = 0;
      for (i; i < header.length; i++) {
        const code = header.charCodeAt(i);
        if (end === -1 && tokenChars[code] === 1) {
          if (start === -1) start = i;
        } else if (i !== 0 && (code === 32 || code === 9)) {
          if (end === -1 && start !== -1) end = i;
        } else if (code === 44) {
          if (start === -1) {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
          if (end === -1) end = i;
          const protocol2 = header.slice(start, end);
          if (protocols.has(protocol2)) {
            throw new SyntaxError(`The "${protocol2}" subprotocol is duplicated`);
          }
          protocols.add(protocol2);
          start = end = -1;
        } else {
          throw new SyntaxError(`Unexpected character at index ${i}`);
        }
      }
      if (start === -1 || end !== -1) {
        throw new SyntaxError("Unexpected end of input");
      }
      const protocol = header.slice(start, i);
      if (protocols.has(protocol)) {
        throw new SyntaxError(`The "${protocol}" subprotocol is duplicated`);
      }
      protocols.add(protocol);
      return protocols;
    }
    module.exports = { parse };
  }
});

// node_modules/ws/lib/websocket-server.js
var require_websocket_server = __commonJS({
  "node_modules/ws/lib/websocket-server.js"(exports, module) {
    "use strict";
    var EventEmitter = __require("events");
    var http = __require("http");
    var { Duplex } = __require("stream");
    var { createHash } = __require("crypto");
    var extension2 = require_extension();
    var PerMessageDeflate2 = require_permessage_deflate();
    var subprotocol2 = require_subprotocol();
    var WebSocket2 = require_websocket();
    var { CLOSE_TIMEOUT, GUID, kWebSocket } = require_constants();
    var keyRegex = /^[+/0-9A-Za-z]{22}==$/;
    var RUNNING = 0;
    var CLOSING = 1;
    var CLOSED = 2;
    var WebSocketServer2 = class extends EventEmitter {
      /**
       * Create a `WebSocketServer` instance.
       *
       * @param {Object} options Configuration options
       * @param {Boolean} [options.allowSynchronousEvents=true] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {Boolean} [options.autoPong=true] Specifies whether or not to
       *     automatically send a pong in response to a ping
       * @param {Number} [options.backlog=511] The maximum length of the queue of
       *     pending connections
       * @param {Boolean} [options.clientTracking=true] Specifies whether or not to
       *     track clients
       * @param {Number} [options.closeTimeout=30000] Duration in milliseconds to
       *     wait for the closing handshake to finish after `websocket.close()` is
       *     called
       * @param {Function} [options.handleProtocols] A hook to handle protocols
       * @param {String} [options.host] The hostname where to bind the server
       * @param {Number} [options.maxBufferedChunks=262144] The maximum number of
       *     buffered data chunks
       * @param {Number} [options.maxFragments=16384] The maximum number of message
       *     fragments
       * @param {Number} [options.maxPayload=104857600] The maximum allowed message
       *     size
       * @param {Boolean} [options.noServer=false] Enable no server mode
       * @param {String} [options.path] Accept only connections matching this path
       * @param {(Boolean|Object)} [options.perMessageDeflate=false] Enable/disable
       *     permessage-deflate
       * @param {Number} [options.port] The port where to bind the server
       * @param {(http.Server|https.Server)} [options.server] A pre-created HTTP/S
       *     server to use
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       * @param {Function} [options.verifyClient] A hook to reject connections
       * @param {Function} [options.WebSocket=WebSocket] Specifies the `WebSocket`
       *     class to use. It must be the `WebSocket` class or class that extends it
       * @param {Function} [callback] A listener for the `listening` event
       */
      constructor(options, callback) {
        super();
        options = {
          allowSynchronousEvents: true,
          autoPong: true,
          maxBufferedChunks: 256 * 1024,
          maxFragments: 16 * 1024,
          maxPayload: 100 * 1024 * 1024,
          skipUTF8Validation: false,
          perMessageDeflate: false,
          handleProtocols: null,
          clientTracking: true,
          closeTimeout: CLOSE_TIMEOUT,
          verifyClient: null,
          noServer: false,
          backlog: null,
          // use default (511 as implemented in net.js)
          server: null,
          host: null,
          path: null,
          port: null,
          WebSocket: WebSocket2,
          ...options
        };
        if (options.port == null && !options.server && !options.noServer || options.port != null && (options.server || options.noServer) || options.server && options.noServer) {
          throw new TypeError(
            'One and only one of the "port", "server", or "noServer" options must be specified'
          );
        }
        if (options.port != null) {
          this._server = http.createServer((req, res) => {
            const body = http.STATUS_CODES[426];
            res.writeHead(426, {
              "Content-Length": body.length,
              "Content-Type": "text/plain"
            });
            res.end(body);
          });
          this._server.listen(
            options.port,
            options.host,
            options.backlog,
            callback
          );
        } else if (options.server) {
          this._server = options.server;
        }
        if (this._server) {
          const emitConnection = this.emit.bind(this, "connection");
          this._removeListeners = addListeners(this._server, {
            listening: this.emit.bind(this, "listening"),
            error: this.emit.bind(this, "error"),
            upgrade: (req, socket, head) => {
              this.handleUpgrade(req, socket, head, emitConnection);
            }
          });
        }
        if (options.perMessageDeflate === true) options.perMessageDeflate = {};
        if (options.clientTracking) {
          this.clients = /* @__PURE__ */ new Set();
          this._shouldEmitClose = false;
        }
        this.options = options;
        this._state = RUNNING;
      }
      /**
       * Returns the bound address, the address family name, and port of the server
       * as reported by the operating system if listening on an IP socket.
       * If the server is listening on a pipe or UNIX domain socket, the name is
       * returned as a string.
       *
       * @return {(Object|String|null)} The address of the server
       * @public
       */
      address() {
        if (this.options.noServer) {
          throw new Error('The server is operating in "noServer" mode');
        }
        if (!this._server) return null;
        return this._server.address();
      }
      /**
       * Stop the server from accepting new connections and emit the `'close'` event
       * when all existing connections are closed.
       *
       * @param {Function} [cb] A one-time listener for the `'close'` event
       * @public
       */
      close(cb) {
        if (this._state === CLOSED) {
          if (cb) {
            this.once("close", () => {
              cb(new Error("The server is not running"));
            });
          }
          process.nextTick(emitClose, this);
          return;
        }
        if (cb) this.once("close", cb);
        if (this._state === CLOSING) return;
        this._state = CLOSING;
        if (this.options.noServer || this.options.server) {
          if (this._server) {
            this._removeListeners();
            this._removeListeners = this._server = null;
          }
          if (this.clients) {
            if (!this.clients.size) {
              process.nextTick(emitClose, this);
            } else {
              this._shouldEmitClose = true;
            }
          } else {
            process.nextTick(emitClose, this);
          }
        } else {
          const server = this._server;
          this._removeListeners();
          this._removeListeners = this._server = null;
          server.close(() => {
            emitClose(this);
          });
        }
      }
      /**
       * See if a given request should be handled by this server instance.
       *
       * @param {http.IncomingMessage} req Request object to inspect
       * @return {Boolean} `true` if the request is valid, else `false`
       * @public
       */
      shouldHandle(req) {
        if (this.options.path) {
          const index = req.url.indexOf("?");
          const pathname = index !== -1 ? req.url.slice(0, index) : req.url;
          if (pathname !== this.options.path) return false;
        }
        return true;
      }
      /**
       * Handle a HTTP Upgrade request.
       *
       * @param {http.IncomingMessage} req The request object
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Function} cb Callback
       * @public
       */
      handleUpgrade(req, socket, head, cb) {
        socket.on("error", socketOnError);
        const key = req.headers["sec-websocket-key"];
        const upgrade = req.headers.upgrade;
        const version = +req.headers["sec-websocket-version"];
        if (req.method !== "GET") {
          const message = "Invalid HTTP method";
          abortHandshakeOrEmitwsClientError(this, req, socket, 405, message);
          return;
        }
        if (upgrade === void 0 || upgrade.toLowerCase() !== "websocket") {
          const message = "Invalid Upgrade header";
          abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
          return;
        }
        if (key === void 0 || !keyRegex.test(key)) {
          const message = "Missing or invalid Sec-WebSocket-Key header";
          abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
          return;
        }
        if (version !== 13 && version !== 8) {
          const message = "Missing or invalid Sec-WebSocket-Version header";
          abortHandshakeOrEmitwsClientError(this, req, socket, 400, message, {
            "Sec-WebSocket-Version": "13, 8"
          });
          return;
        }
        if (!this.shouldHandle(req)) {
          abortHandshake(socket, 400);
          return;
        }
        const secWebSocketProtocol = req.headers["sec-websocket-protocol"];
        let protocols = /* @__PURE__ */ new Set();
        if (secWebSocketProtocol !== void 0) {
          try {
            protocols = subprotocol2.parse(secWebSocketProtocol);
          } catch (err) {
            const message = "Invalid Sec-WebSocket-Protocol header";
            abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
            return;
          }
        }
        const secWebSocketExtensions = req.headers["sec-websocket-extensions"];
        const extensions = {};
        if (this.options.perMessageDeflate && secWebSocketExtensions !== void 0) {
          const perMessageDeflate = new PerMessageDeflate2({
            ...this.options.perMessageDeflate,
            isServer: true,
            maxPayload: this.options.maxPayload
          });
          try {
            const offers = extension2.parse(secWebSocketExtensions);
            if (offers[PerMessageDeflate2.extensionName]) {
              perMessageDeflate.accept(offers[PerMessageDeflate2.extensionName]);
              extensions[PerMessageDeflate2.extensionName] = perMessageDeflate;
            }
          } catch (err) {
            const message = "Invalid or unacceptable Sec-WebSocket-Extensions header";
            abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
            return;
          }
        }
        if (this.options.verifyClient) {
          const info = {
            origin: req.headers[`${version === 8 ? "sec-websocket-origin" : "origin"}`],
            secure: !!(req.socket.authorized || req.socket.encrypted),
            req
          };
          if (this.options.verifyClient.length === 2) {
            this.options.verifyClient(info, (verified, code, message, headers) => {
              if (!verified) {
                return abortHandshake(socket, code || 401, message, headers);
              }
              this.completeUpgrade(
                extensions,
                key,
                protocols,
                req,
                socket,
                head,
                cb
              );
            });
            return;
          }
          if (!this.options.verifyClient(info)) return abortHandshake(socket, 401);
        }
        this.completeUpgrade(extensions, key, protocols, req, socket, head, cb);
      }
      /**
       * Upgrade the connection to WebSocket.
       *
       * @param {Object} extensions The accepted extensions
       * @param {String} key The value of the `Sec-WebSocket-Key` header
       * @param {Set} protocols The subprotocols
       * @param {http.IncomingMessage} req The request object
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Function} cb Callback
       * @throws {Error} If called more than once with the same socket
       * @private
       */
      completeUpgrade(extensions, key, protocols, req, socket, head, cb) {
        if (!socket.readable || !socket.writable) return socket.destroy();
        if (socket[kWebSocket]) {
          throw new Error(
            "server.handleUpgrade() was called more than once with the same socket, possibly due to a misconfiguration"
          );
        }
        if (this._state > RUNNING) return abortHandshake(socket, 503);
        const digest = createHash("sha1").update(key + GUID).digest("base64");
        const headers = [
          "HTTP/1.1 101 Switching Protocols",
          "Upgrade: websocket",
          "Connection: Upgrade",
          `Sec-WebSocket-Accept: ${digest}`
        ];
        const ws2 = new this.options.WebSocket(null, void 0, this.options);
        if (protocols.size) {
          const protocol = this.options.handleProtocols ? this.options.handleProtocols(protocols, req) : protocols.values().next().value;
          if (protocol) {
            headers.push(`Sec-WebSocket-Protocol: ${protocol}`);
            ws2._protocol = protocol;
          }
        }
        if (extensions[PerMessageDeflate2.extensionName]) {
          const params = extensions[PerMessageDeflate2.extensionName].params;
          const value = extension2.format({
            [PerMessageDeflate2.extensionName]: [params]
          });
          headers.push(`Sec-WebSocket-Extensions: ${value}`);
          ws2._extensions = extensions;
        }
        this.emit("headers", headers, req);
        socket.write(headers.concat("\r\n").join("\r\n"));
        socket.removeListener("error", socketOnError);
        ws2.setSocket(socket, head, {
          allowSynchronousEvents: this.options.allowSynchronousEvents,
          maxBufferedChunks: this.options.maxBufferedChunks,
          maxFragments: this.options.maxFragments,
          maxPayload: this.options.maxPayload,
          skipUTF8Validation: this.options.skipUTF8Validation
        });
        if (this.clients) {
          this.clients.add(ws2);
          ws2.on("close", () => {
            this.clients.delete(ws2);
            if (this._shouldEmitClose && !this.clients.size) {
              process.nextTick(emitClose, this);
            }
          });
        }
        cb(ws2, req);
      }
    };
    module.exports = WebSocketServer2;
    function addListeners(server, map) {
      for (const event of Object.keys(map)) server.on(event, map[event]);
      return function removeListeners() {
        for (const event of Object.keys(map)) {
          server.removeListener(event, map[event]);
        }
      };
    }
    function emitClose(server) {
      server._state = CLOSED;
      server.emit("close");
    }
    function socketOnError() {
      this.destroy();
    }
    function abortHandshake(socket, code, message, headers) {
      message = message || http.STATUS_CODES[code];
      headers = {
        Connection: "close",
        "Content-Type": "text/html",
        "Content-Length": Buffer.byteLength(message),
        ...headers
      };
      socket.once("finish", socket.destroy);
      socket.end(
        `HTTP/1.1 ${code} ${http.STATUS_CODES[code]}\r
` + Object.keys(headers).map((h) => `${h}: ${headers[h]}`).join("\r\n") + "\r\n\r\n" + message
      );
    }
    function abortHandshakeOrEmitwsClientError(server, req, socket, code, message, headers) {
      if (server.listenerCount("wsClientError")) {
        const err = new Error(message);
        Error.captureStackTrace(err, abortHandshakeOrEmitwsClientError);
        server.emit("wsClientError", err, socket, req);
      } else {
        abortHandshake(socket, code, message, headers);
      }
    }
  }
});

// node_modules/ws/wrapper.mjs
var import_stream = __toESM(require_stream(), 1);
var import_extension = __toESM(require_extension(), 1);
var import_permessage_deflate = __toESM(require_permessage_deflate(), 1);
var import_receiver = __toESM(require_receiver(), 1);
var import_sender = __toESM(require_sender(), 1);
var import_subprotocol = __toESM(require_subprotocol(), 1);
var import_websocket = __toESM(require_websocket(), 1);
var import_websocket_server = __toESM(require_websocket_server(), 1);

// src/plugin.js
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn, execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
var PLUGIN_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
var PLUGIN_VERSION = "";
try {
  PLUGIN_VERSION = JSON.parse(fs.readFileSync(path.join(PLUGIN_DIR, "manifest.json"), "utf8")).Version ?? "";
} catch {
}
var CLAUDE_DIR = path.join(os.homedir(), ".claude");
var CREDS_FILE = path.join(CLAUDE_DIR, ".credentials.json");
var SESSIONS_DIR = path.join(CLAUDE_DIR, "sessions");
var PROJECTS_DIR = path.join(CLAUDE_DIR, "projects");
var STATS_CACHE = path.join(CLAUDE_DIR, "stats-cache.json");
var USAGE_URL = "https://api.anthropic.com/api/oauth/usage";
var githubDir = path.join(os.homedir(), "Documents", "GitHub");
var DEFAULT_CODE_DIR = fs.existsSync(githubDir) ? githubDir : os.homedir();
var desktopAppId = "shell:AppsFolder\\Claude_pzs8sxrjxfjjc!Claude";
execFile(
  "powershell.exe",
  [
    "-NoProfile",
    "-Command",
    "Get-StartApps | Where-Object {$_.Name -eq 'Claude'} | Select-Object -First 1 -ExpandProperty AppID"
  ],
  (err, out) => {
    const id = out?.trim();
    if (!err && id) desktopAppId = "shell:AppsFolder\\" + id;
  }
);
var LOG_FILE = path.join(process.cwd(), "claude-deck.log");
function log(...args) {
  const line = `${(/* @__PURE__ */ new Date()).toISOString()} ${args.map((a) => typeof a === "string" ? a : JSON.stringify(a)).join(" ")}`;
  console.log(line);
  try {
    fs.appendFileSync(LOG_FILE, line + "\n");
  } catch {
  }
}
var C = {
  bg: "#16151c",
  panel: "#211f2b",
  text: "#f5f1ea",
  dim: "#9b96a8",
  accent: "#d97757",
  // Claude orange
  accentHi: "#f0a184",
  // lighter accent — marks "today" in the 7-day chart
  ok: "#4ade80",
  warn: "#fbbf24",
  bad: "#f87171",
  track: "#3a3745"
};
var pctColor = (p) => p == null ? C.dim : p >= 85 ? C.bad : p >= 60 ? C.warn : C.ok;
var esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
var SPARK_PATH = "M121.79 21.82 L120.60 9.01 L118.39 21.68 Z M122.56 22.82 L125.12 14.49 L119.57 21.21 Z M122.81 24.26 L131.48 16.90 L121.02 21.37 Z M122.18 25.79 L130.19 24.41 L122.32 22.39 Z M121.18 26.56 L132.55 30.75 L122.79 23.57 Z M119.74 26.81 L125.52 32.93 L122.63 25.02 Z M118.21 26.18 L119.40 38.99 L121.61 26.32 Z M117.44 25.18 L115.03 33.25 L120.43 26.79 Z M117.19 23.74 L108.26 31.26 L118.98 26.63 Z M117.82 22.21 L110.11 23.60 L117.68 25.61 Z M118.82 21.44 L107.58 17.32 L117.21 24.43 Z M120.26 21.19 L114.32 14.81 L117.37 22.98 Z";
var sparkAt = (x, y, color = C.accent, opacity = 1, scale = 1) => `<g transform="translate(${x} ${y}) scale(${scale}) translate(-120 -24)"><path d="${SPARK_PATH}" fill="${color}" stroke="${color}" stroke-width="0.8" stroke-linejoin="round" opacity="${opacity}"/></g>`;
var WATERMARK;
try {
  const b64 = fs.readFileSync(path.join(PLUGIN_DIR, "imgs", "launch.png")).toString("base64");
  WATERMARK = `<image xlink:href="data:image/png;base64,${b64}" href="data:image/png;base64,${b64}" x="24" y="24" width="96" height="96" opacity="0.12"/>`;
} catch {
  WATERMARK = sparkAt(72, 76, C.accent, 0.08, 2.4);
}
function svgWrap(inner, mark = true) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="144" height="144" viewBox="0 0 144 144"><rect width="144" height="144" rx="18" fill="${C.bg}"/>${mark ? WATERMARK : ""}${inner}</svg>`;
  return "data:image/svg+xml," + encodeURIComponent(svg);
}
function gaugeKey(label, pct, sub, pulsePhase = null) {
  const has = typeof pct === "number" && isFinite(pct);
  const p = has ? Math.max(0, Math.min(100, pct)) : 0;
  const col = has ? pctColor(p) : C.dim;
  const pulse = pulsePhase == null ? "" : `<rect x="4" y="4" width="136" height="136" rx="16" fill="none" stroke="${C.bad}" stroke-width="6" opacity="${[0.2, 0.55, 0.95][pulsePhase % 3]}"/>`;
  return svgWrap(`
    ${pulse}
    <text x="14" y="27" font-family="Segoe UI, sans-serif" font-size="17" font-weight="600" letter-spacing="0.5" fill="${C.dim}">${esc(label)}</text>
    <text x="72" y="78" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="${has ? 46 : 34}" font-weight="700" fill="${has ? col : C.dim}">${has ? Math.round(p) + "%" : "--"}</text>
    <rect x="14" y="90" width="116" height="12" rx="6" fill="${C.track}"/>
    ${has ? `<rect x="14" y="90" width="${Math.max(8, 116 * p / 100)}" height="12" rx="6" fill="${col}"/>` : ""}
    <text x="72" y="128" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="16" fill="${C.dim}">${esc(sub ?? "")}</text>`);
}
var CAP_5H = 5 * 36e5;
var CAP_7D = 7 * 864e5;
function capKey(label, resetsAt, windowMs, phase) {
  const now = Date.now();
  const ms = new Date(resetsAt).getTime() - now;
  const p2 = (n) => String(n).padStart(2, "0");
  const live = ms > 0;
  const d = Math.floor(ms / 864e5);
  const hOfDay = Math.floor(ms % 864e5 / 36e5);
  const h = Math.floor(ms / 36e5), m = Math.floor(ms % 36e5 / 6e4), s = Math.floor(ms % 6e4 / 1e3);
  const clock = !live ? "--:--" : d >= 1 ? `${d}d ${p2(hOfDay)}:${p2(m)}` : h > 0 ? `${h}:${p2(m)}:${p2(s)}` : `${p2(m)}:${p2(s)}`;
  const size = Math.min(46, Math.floor(124 / (clock.length * 0.55)));
  const done = live ? Math.max(0, Math.min(1, 1 - ms / windowMs)) : 1;
  const segs = 11, lit = Math.round(segs * done);
  const bar = Array.from({ length: segs }, (_, i) => `<rect x="${13 + i * 11.6}" y="119" width="8" height="10" rx="2" fill="${i < lit ? C.accent : C.track}" opacity="${i < lit ? 1 : 0.35}"/>`).join("");
  let scan = "";
  for (let y = 10; y < 138; y += 6) scan += `<rect x="6" y="${y}" width="132" height="1" fill="${C.text}" opacity="0.045"/>`;
  const at = !live ? "any moment" : ms >= 864e5 ? new Date(resetsAt).toLocaleString([], { weekday: "short", hour: "numeric" }).replace(",", "") : new Date(resetsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return svgWrap(`
    ${scan}
    <rect x="5" y="5" width="134" height="134" rx="12" fill="none" stroke="${C.bad}" stroke-width="3" opacity="${[0.35, 0.7, 1][phase % 3]}"/>
    <text x="72" y="33" text-anchor="middle" font-family="${MONO}" font-size="15" font-weight="700" letter-spacing="1.5" fill="${C.bad}">${esc(label)}</text>
    <text x="72" y="83" text-anchor="middle" font-family="${MONO}" font-size="${size}" font-weight="700" fill="${C.accentHi}" xml:space="preserve">${clock}</text>
    <text x="72" y="107" text-anchor="middle" font-family="${MONO}" font-size="14" fill="${C.dim}">${live ? "resets " + esc(at) : "resetting"}</text>
    ${bar}`, false);
}
function linesKey(title, rows, accent = C.accent) {
  const rowSvg = rows.map((r, i) => {
    const y = 62 + i * 31;
    return `<text x="14" y="${y}" font-family="Segoe UI, sans-serif" font-size="${r.big ? 28 : 20}" font-weight="${r.big ? 700 : 600}" fill="${r.color ?? C.text}">${esc(r.text)}</text>`;
  }).join("");
  return svgWrap(`
    <rect x="0" y="0" width="144" height="34" rx="18" fill="${C.panel}"/>
    <rect x="0" y="17" width="144" height="17" fill="${C.panel}"/>
    <text x="14" y="24" font-family="Segoe UI, sans-serif" font-size="17" font-weight="600" letter-spacing="0.5" fill="${accent}">${esc(title)}</text>
    ${rowSvg}`);
}
function bigCountKey(title, count, sub, subColor, animPhase2 = null, subSize = 17) {
  const dots = animPhase2 == null ? "" : [0, 1, 2].map((i) => `<circle cx="122" cy="${56 + i * 16}" r="${i === animPhase2 ? 4.5 : 3}" fill="${i === animPhase2 ? C.ok : C.track}"/>`).join("");
  return svgWrap(`
    <text x="14" y="27" font-family="Segoe UI, sans-serif" font-size="17" font-weight="600" letter-spacing="0.5" fill="${C.dim}">${esc(title)}</text>
    ${dots}
    <text x="72" y="96" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="64" font-weight="700" fill="${count > 0 ? C.text : C.dim}">${count}</text>
    <text x="72" y="128" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="${subSize}" fill="${subColor ?? C.dim}">${esc(sub ?? "")}</text>`);
}
function burnKey(tokensHour, sub) {
  const has = tokensHour != null;
  return svgWrap(`
    <text x="14" y="27" font-family="Segoe UI, sans-serif" font-size="17" font-weight="600" letter-spacing="0.5" fill="${C.dim}">BURN RATE</text>
    <text x="72" y="82" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="40" font-weight="700" fill="${has ? C.accent : C.dim}">${has ? fmtNum(tokensHour) : "--"}</text>
    <text x="72" y="104" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="16" fill="${C.dim}">tok/hr</text>
    <text x="72" y="128" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="15" fill="${C.dim}">${esc(sub ?? "")}</text>`);
}
function labelKey(title, label, sub, accent = C.accent) {
  const text = String(label ?? "").trim() || "\u2014";
  const words = text.split(/\s+/);
  const lines = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length <= 11) cur = (cur + " " + w).trim();
    else {
      lines.push(cur);
      cur = w;
      if (lines.length === 2) break;
    }
  }
  if (cur && lines.length < 2) lines.push(cur);
  const lineSvg = lines.slice(0, 2).map((l, i) => `<text x="72" y="${lines.length > 1 ? 68 + i * 27 : 82}" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="22" font-weight="700" fill="${C.text}">${esc(l.slice(0, 12))}</text>`).join("");
  return svgWrap(`
    <text x="14" y="27" font-family="Segoe UI, sans-serif" font-size="17" font-weight="600" letter-spacing="0.5" fill="${accent}">${esc(title)}</text>
    ${lineSvg}
    <text x="72" y="128" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="15" fill="${C.dim}">${esc(sub ?? "")}</text>`);
}
var CHART_COLS = 8;
var CHART_ROWS = 4;
var KEY = 144;
var CHART_DAYS = 7;
var LABEL_H = 40;
var AXIS_Y = CHART_ROWS * KEY - LABEL_H;
var BLOCK_H = 20;
var BLOCK_GAP = 4;
var BLOCKS = 21;
var dayVal = (d, metric) => (metric === "msgs" ? d?.msgs : d?.tokens) ?? 0;
function barCellKey(d, row, max, metric) {
  const v = dayVal(d, metric);
  const frac = max > 0 ? Math.min(1, v / max) : 0;
  const filled = frac * BLOCKS;
  const full = Math.floor(filled);
  const part = filled - full;
  const col = d.isToday ? C.accentHi : C.accent;
  let out = "";
  for (let i = 0; i < BLOCKS; i++) {
    const y = AXIS_Y - i * (BLOCK_H + BLOCK_GAP) - BLOCK_H - row * KEY;
    if (y > KEY || y + BLOCK_H < 0) continue;
    let fill = C.track, op = 0.32;
    if (i < full) {
      fill = col;
      op = 1;
    } else if (i === full && part > 0.03) {
      fill = col;
      op = 0.45 + 0.55 * part;
    }
    out += `<rect x="26" y="${y}" width="92" height="${BLOCK_H}" rx="5" fill="${fill}" opacity="${op}"/>`;
  }
  if (row === CHART_ROWS - 1) {
    const a = AXIS_Y - row * KEY;
    out += `<rect x="14" y="${a}" width="116" height="2" rx="1" fill="${d.isToday ? col : C.track}"/>
      <text x="72" y="${a + 20}" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="15" font-weight="600" letter-spacing="0.5" fill="${d.isToday ? col : C.dim}">${esc(d.label)}</text>
      <text x="72" y="${a + 37}" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="16" font-weight="700" fill="${C.text}">${fmtNum(v)}</text>`;
  }
  return svgWrap(out, false);
}
function chartStatKey(title, value, sub, color = C.accent) {
  return svgWrap(`
    <text x="14" y="27" font-family="Segoe UI, sans-serif" font-size="16" font-weight="600" letter-spacing="0.5" fill="${C.dim}">${esc(title)}</text>
    <text x="72" y="88" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="36" font-weight="700" fill="${color}">${esc(value)}</text>
    <text x="72" y="122" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="16" fill="${C.dim}">${esc(sub ?? "")}</text>`, false);
}
function backCellKey() {
  return svgWrap(`
    <path d="M86 34 L54 68 L86 102" fill="none" stroke="${C.accent}" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/>
    <text x="72" y="130" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="20" font-weight="700" letter-spacing="1" fill="${C.text}">BACK</text>`, false);
}
function chartOpenKey(days, metric) {
  const vals = days.map((d) => dayVal(d, metric));
  const max = Math.max(...vals, 1);
  const bars = days.length ? days.map((d, i) => {
    const h = Math.max(4, Math.round(62 * (dayVal(d, metric) / max)));
    return `<rect x="${13 + i * 17}" y="${102 - h}" width="13" height="${h}" rx="3" fill="${d.isToday ? C.accentHi : C.accent}" opacity="${d.isToday ? 1 : 0.75}"/>`;
  }).join("") : `<text x="72" y="84" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="20" fill="${C.dim}">--</text>`;
  const total = vals.reduce((a, b) => a + b, 0);
  return svgWrap(`
    <text x="14" y="27" font-family="Segoe UI, sans-serif" font-size="17" font-weight="600" letter-spacing="0.5" fill="${C.dim}">7 DAYS</text>
    ${bars}
    <rect x="13" y="103" width="119" height="2" rx="1" fill="${C.track}"/>
    <text x="72" y="130" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="17" font-weight="700" fill="${C.text}">${fmtNum(total)}${metric === "msgs" ? " msgs" : " tok"}</text>`);
}
var RAIN_STEP = 22;
var RAIN_BH = 16;
var RAIN_TRAIL = 8;
var RAIN_LANE_W = 36;
var fracOf = (n) => n - Math.floor(n);
var laneHash = (i, salt) => fracOf(Math.sin((i + 1) * 12.9898 + salt * 78.233) * 43758.5453);
function rainCellKey(lc, lr, cols, rows, t, busy, burn) {
  const W = cols * KEY, H = rows * KEY;
  const lanes = Math.max(1, Math.round(W / RAIN_LANE_W));
  const laneW = W / lanes;
  const bw = Math.min(28, Math.max(10, laneW - 12));
  const ox = lc * KEY, oy = lr * KEY;
  const trailLen = RAIN_TRAIL * RAIN_STEP;
  const speed = 55 + Math.min(150, (burn ?? 0) / 4e5);
  const density = busy > 0 ? Math.min(1, 0.25 + 0.18 * busy) : 0;
  const streams = density > 0.55 ? 2 : 1;
  let out = "";
  for (let i = 0; i < lanes; i++) {
    const x = i * laneW + (laneW - bw) / 2 - ox;
    if (x > KEY + 2 || x + bw < -2) continue;
    if (laneHash(i, 3) >= density) {
      for (let y = H % RAIN_STEP / 2; y < H; y += RAIN_STEP) {
        const ly = y - oy;
        if (ly > KEY + 2 || ly + RAIN_BH < -2) continue;
        out += `<rect x="${x.toFixed(1)}" y="${ly.toFixed(1)}" width="${bw.toFixed(1)}" height="${RAIN_BH}" rx="4" fill="${C.track}" opacity="0.13"/>`;
      }
      continue;
    }
    const sp = speed * (0.7 + 0.6 * laneHash(i, 1));
    for (let s = 0; s < streams; s++) {
      const head = fracOf(laneHash(i, 2) + s / streams + t / 1e3 * sp / (H + trailLen)) * (H + trailLen);
      for (let j = 0; j <= RAIN_TRAIL; j++) {
        const y = head - j * RAIN_STEP - oy;
        if (y > KEY + 2 || y + RAIN_BH < -2) continue;
        const fade = Math.pow(1 - j / (RAIN_TRAIL + 1), 1.4);
        out += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${RAIN_BH}" rx="4" fill="${j === 0 ? C.accentHi : C.accent}" opacity="${(j === 0 ? 1 : 0.9 * fade).toFixed(2)}"/>`;
      }
    }
  }
  if (!density && lc === Math.floor((cols - 1) / 2) && lr === Math.floor((rows - 1) / 2))
    out += sparkAt(72, 72, C.accent, 0.2, 2.2);
  return svgWrap(out, false);
}
var MONO = "Cascadia Mono, Consolas, monospace";
var LOG_MAX = 60;
var LOG_STYLE = {
  start: { g: "+", c: C.accentHi },
  busy: { g: ">", c: C.accent },
  idle: { g: ".", c: C.dim },
  end: { g: "x", c: C.dim },
  tok: { g: "$", c: C.text },
  info: { g: "#", c: C.dim }
};
function pushLog(kind, name, detail) {
  state.log.push({ t: Date.now(), kind, name, detail });
  if (state.log.length > LOG_MAX) state.log.splice(0, state.log.length - LOG_MAX);
}
function termCellKey(lc, lr, cols, rows, t) {
  const LH = 25, PAD = 9, TOP = 24, FS = 17, CW = FS * 0.55;
  const perKey = Math.max(4, Math.floor((KEY - PAD * 2) / CW));
  const perRow = Math.max(1, Math.floor((KEY - 8 - TOP) / LH) + 1);
  const width = perKey * cols;
  const log2 = state.log.slice(-(perRow * rows - 3));
  const now = Date.now();
  let out = "";
  const line = (i, text, color) => {
    if (Math.floor(i / perRow) !== lr) return "";
    const slice = text.slice(lc * perKey, (lc + 1) * perKey);
    if (!slice.trim()) return "";
    return `<text x="${PAD}" y="${TOP + i % perRow * LH}" font-family="${MONO}" font-size="${FS}" fill="${color}" xml:space="preserve">${esc(slice)}</text>`;
  };
  out += line(0, `claude-deck v${PLUGIN_VERSION}`, C.dim);
  out += line(1, "-".repeat(width), C.track);
  log2.forEach((ln, k) => {
    const st = LOG_STYLE[ln.kind] ?? LOG_STYLE.info;
    const full = `${st.g} ${String(ln.name ?? "").slice(0, 18)} ${ln.detail ?? ""}`.slice(0, width);
    out += line(2 + k, full.slice(0, Math.max(0, Math.floor((now - ln.t) / 18))), st.c);
  });
  const last = log2[log2.length - 1];
  const typing = last && now - last.t < 18 * width;
  out += line(2 + log2.length, `claude@deck $ ${!typing && t % 1e3 < 520 ? "_" : ""}`, C.accent);
  return svgWrap(out, false);
}
var LIFE_CELL = 24;
function lifeStep(sim, busy) {
  const { w, h } = sim;
  const next = new Uint8Array(w * h);
  let pop = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let n = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          n += sim.cur[(y + dy + h) % h * w + (x + dx + w) % w];
        }
      const alive = sim.cur[y * w + x];
      const live = alive ? n === 2 || n === 3 : n === 3;
      next[y * w + x] = live ? 1 : 0;
      if (live) pop++;
    }
  }
  sim.prev = sim.cur;
  sim.cur = next;
  if (busy > 0 && Math.random() < 0.18 * busy) lifeGlider(sim);
  sim.stale = pop === sim.pop ? sim.stale + 1 : 0;
  sim.pop = pop;
  if (pop < 6 || sim.stale > 40) lifeSeed(sim, busy);
}
function lifeGlider(sim) {
  const g = [[1, 0], [2, 1], [0, 2], [1, 2], [2, 2]];
  const x0 = Math.floor(Math.random() * sim.w), y0 = Math.floor(Math.random() * sim.h);
  for (const [dx, dy] of g) sim.cur[(y0 + dy) % sim.h * sim.w + (x0 + dx) % sim.w] = 1;
}
function lifeSeed(sim, busy) {
  const fill = 0.12 + 0.04 * Math.min(4, busy);
  for (let i = 0; i < sim.cur.length; i++) sim.cur[i] = Math.random() < fill ? 1 : 0;
  sim.stale = 0;
}
function lifeCellKey(lc, lr, cols, rows, t, sim) {
  const ox = lc * KEY, oy = lr * KEY;
  const c0 = Math.floor(ox / LIFE_CELL), c1 = Math.ceil((ox + KEY) / LIFE_CELL);
  const r0 = Math.floor(oy / LIFE_CELL), r1 = Math.ceil((oy + KEY) / LIFE_CELL);
  const s = LIFE_CELL - 4;
  let out = "";
  for (let y = r0; y < Math.min(r1, sim.h); y++) {
    for (let x = c0; x < Math.min(c1, sim.w); x++) {
      const alive = sim.cur[y * sim.w + x];
      const was = sim.prev?.[y * sim.w + x];
      if (!alive && !was) continue;
      const px = x * LIFE_CELL + 2 - ox, py = y * LIFE_CELL + 2 - oy;
      const fill = alive ? was ? C.accent : C.accentHi : C.accent;
      out += `<rect x="${px}" y="${py}" width="${s}" height="${s}" rx="4" fill="${fill}" opacity="${alive ? 1 : 0.18}"/>`;
    }
  }
  return svgWrap(out, false);
}
function burnSeries(buckets, bucketMs) {
  const now = Date.now();
  const out = new Array(buckets).fill(0);
  for (const rec of hourTracker.values()) {
    for (const e of rec.events) {
      const idx = buckets - 1 - Math.floor((now - e.t) / bucketMs);
      if (idx >= 0 && idx < buckets) out[idx] += e.tok;
    }
  }
  return out;
}
function historyCellKey(lc, lr, cols, rows, t, sim) {
  const W = cols * KEY, H = rows * KEY;
  const ox = lc * KEY, oy = lr * KEY;
  const PAD = 12, HEAD = 30, FOOT = 26;
  const cw = 16, gap = 3;
  const n = Math.max(4, Math.floor((W - PAD * 2) / cw));
  const vals = burnSeries(n, sim.bucketMs);
  const max = Math.max(...vals, 1);
  const top = HEAD, bottom = H - FOOT;
  const blockH = 12, blockGap = 3;
  const slots = Math.max(1, Math.floor((bottom - top) / (blockH + blockGap)));
  let out = "";
  for (let i = 0; i < n; i++) {
    const x = PAD + i * cw - ox;
    if (x > KEY + 2 || x + cw - gap < -2) continue;
    const filled = Math.round(slots * (vals[i] / max));
    const isNow = i === n - 1;
    for (let k = 0; k < slots; k++) {
      const y = bottom - (k + 1) * (blockH + blockGap) + blockGap - oy;
      if (y > KEY + 2 || y + blockH < -2) continue;
      const on = k < filled;
      if (!on && !(k === 0)) {
        out += `<rect x="${x}" y="${y}" width="${cw - gap}" height="${blockH}" rx="3" fill="${C.track}" opacity="0.12"/>`;
        continue;
      }
      out += `<rect x="${x}" y="${y}" width="${cw - gap}" height="${blockH}" rx="3" fill="${on ? isNow ? C.accentHi : C.accent : C.track}" opacity="${on ? 1 : 0.25}"/>`;
    }
  }
  const label = (x, y, s, col, anchor = "start", size = 15) => {
    const lx = x - ox, ly = y - oy;
    if (ly < -20 || ly > KEY + 20) return "";
    return `<text x="${lx}" y="${ly}" text-anchor="${anchor}" font-family="${MONO}" font-size="${size}" fill="${col}">${esc(s)}</text>`;
  };
  const mins = Math.round(n * sim.bucketMs / 6e4);
  out += label(PAD, 22, `BURN ${mins}m`, C.dim);
  out += label(W - PAD, 22, `${fmtNum(state.burn?.tokensHour ?? 0)}/hr`, C.accent, "end");
  out += label(PAD, H - 8, `-${mins}m`, C.dim);
  out += label(W - PAD, H - 8, "now", C.dim, "end");
  return svgWrap(out, false);
}
var PIPE_CELL = 24;
var PIPE_TINTS = ["#d97757", "#f0a184", "#b0603f"];
var DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
function pipeStep(sim, busy) {
  const want = Math.min(4, 1 + busy);
  while (sim.pipes.length < want) sim.pipes.push(newPipe(sim));
  if (sim.fade > 0) {
    sim.fade -= 0.06;
    if (sim.fade <= 0) {
      sim.pipes = [];
      sim.cells = 0;
      sim.fade = 0;
    }
    return;
  }
  for (const p of sim.pipes) {
    const opts = DIRS.map(([dx, dy]) => [p.x + dx, p.y + dy, dx, dy]).filter(([x, y]) => x >= 0 && y >= 0 && x < sim.w && y < sim.h);
    if (!opts.length) {
      p.done = true;
      continue;
    }
    const straight = opts.find(([, , dx, dy]) => dx === p.dx && dy === p.dy);
    const pick = straight && Math.random() < 0.7 ? straight : opts[Math.floor(Math.random() * opts.length)];
    p.x = pick[0];
    p.y = pick[1];
    p.dx = pick[2];
    p.dy = pick[3];
    p.pts.push([p.x, p.y]);
    if (p.pts.length > 400) p.pts.shift();
    sim.cells++;
  }
  if (sim.cells > sim.w * sim.h * 0.55) sim.fade = 1;
}
function newPipe(sim) {
  const d = DIRS[Math.floor(Math.random() * DIRS.length)];
  const x = Math.floor(Math.random() * sim.w), y = Math.floor(Math.random() * sim.h);
  return { x, y, dx: d[0], dy: d[1], pts: [[x, y]], tint: PIPE_TINTS[Math.floor(Math.random() * PIPE_TINTS.length)] };
}
function pipesCellKey(lc, lr, cols, rows, t, sim) {
  const ox = lc * KEY, oy = lr * KEY;
  const half = PIPE_CELL / 2, thick = 12;
  const op = sim.fade > 0 ? Math.max(0, sim.fade) : 1;
  let out = "";
  for (const p of sim.pipes) {
    for (let i = 0; i < p.pts.length; i++) {
      const [x, y] = p.pts[i];
      const cx = x * PIPE_CELL + half - ox, cy = y * PIPE_CELL + half - oy;
      if (cx < -PIPE_CELL || cx > KEY + PIPE_CELL || cy < -PIPE_CELL || cy > KEY + PIPE_CELL) continue;
      out += `<rect x="${cx - thick / 2}" y="${cy - thick / 2}" width="${thick}" height="${thick}" rx="3" fill="${p.tint}" opacity="${op}"/>`;
      if (i === 0) continue;
      const [px, py] = p.pts[i - 1];
      const pcx = px * PIPE_CELL + half - ox, pcy = py * PIPE_CELL + half - oy;
      const x0 = Math.min(cx, pcx) - thick / 2, y0 = Math.min(cy, pcy) - thick / 2;
      const w = Math.abs(cx - pcx) + thick, h = Math.abs(cy - pcy) + thick;
      out += `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" rx="3" fill="${p.tint}" opacity="${op}"/>`;
    }
    const head = p.pts[p.pts.length - 1];
    if (head) {
      const hx = head[0] * PIPE_CELL + half - ox, hy = head[1] * PIPE_CELL + half - oy;
      if (hx > -30 && hx < KEY + 30 && hy > -30 && hy < KEY + 30)
        out += `<rect x="${hx - 8}" y="${hy - 8}" width="16" height="16" rx="4" fill="${C.text}" opacity="${0.9 * op}"/>`;
    }
  }
  return svgWrap(out, false);
}
function fmtReset(iso) {
  if (!iso) return "";
  const ms = new Date(iso).getTime() - Date.now();
  if (!isFinite(ms) || ms <= 0) return "resetting\u2026";
  const h = Math.floor(ms / 36e5), m = Math.round(ms % 36e5 / 6e4);
  if (h >= 48) return `${Math.round(h / 24)}d left`;
  return h > 0 ? `${h}h ${m}m left` : `${m}m left`;
}
function fmtNum(n) {
  if (n == null) return "--";
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "k";
  return String(n);
}
function fmtAgo(ts) {
  const ms = Date.now() - ts;
  const h = Math.floor(ms / 36e5), m = Math.floor(ms % 36e5 / 6e4);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
var state = {
  usage: null,
  // { fiveHour, weekly, weeklyOpus } each { pct, resetsAt }
  usageErr: null,
  usageAt: 0,
  sessions: [],
  agents: 0,
  // live SDK-spawned sessions — counted, but not shown as sessions
  log: [],
  // recent events, tailed by the terminal tile
  today: null,
  week: null,
  // { days: [{ day, label, tokens, msgs, isToday }], at }
  burn: null,
  pctHistory: [],
  loggedRaw: false
};
async function readToken() {
  const raw = await fsp.readFile(CREDS_FILE, "utf8");
  const o = JSON.parse(raw)?.claudeAiOauth;
  if (!o?.accessToken) return null;
  return {
    token: o.accessToken,
    expired: typeof o.expiresAt === "number" && o.expiresAt <= Date.now()
  };
}
function pickBucket(o) {
  if (!o || typeof o !== "object") return null;
  let pct = null;
  if (typeof o.utilization === "number") pct = o.utilization;
  const resetsAt = o.resets_at ?? o.resetsAt ?? null;
  return pct == null && !resetsAt ? null : { pct, resetsAt };
}
var USAGE_DELAY_BASE = 9e4;
var AUTH_RETRY = 15e3;
var usageBackoff = 0;
var authWait = false;
var authDeadToken = null;
var lastUsageAttempt = 0;
var lastUsageErrLogged = null;
function nextUsageDelay() {
  if (authWait) return AUTH_RETRY;
  if (usageBackoff) return usageBackoff;
  const b = state.usage?.fiveHour;
  const pct = b?.pct ?? 0;
  const ms = b?.resetsAt ? new Date(b.resetsAt).getTime() - Date.now() : Infinity;
  if (ms > -5 * 6e4 && ms < 2 * 6e4) return 15e3;
  if (pct >= 95) return 2e4;
  if (pct >= 75) return 45e3;
  return USAGE_DELAY_BASE;
}
var CACHE_TTL = 12 * 36e5;
var CACHE_FILE = path.join(PLUGIN_DIR, "usage-cache.json");
try {
  const c = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
  if (Date.now() - c.at < CACHE_TTL) {
    state.usage = c.usage;
    state.usageAt = c.at;
  }
} catch {
}
async function pollUsage() {
  lastUsageAttempt = Date.now();
  try {
    const cred = await readToken();
    if (!cred) throw new Error("no OAuth token in credentials file", { cause: "auth" });
    if (cred.expired) throw new Error("token expired \u2014 waiting for refresh", { cause: "auth" });
    if (cred.token === authDeadToken) throw new Error("token rejected \u2014 waiting for refresh", { cause: "auth" });
    const res = await fetch(USAGE_URL, {
      headers: {
        Authorization: `Bearer ${cred.token}`,
        "anthropic-beta": "oauth-2025-04-20",
        "Content-Type": "application/json"
      }
    });
    if (res.status === 429) {
      authWait = false;
      usageBackoff = Math.min(usageBackoff ? usageBackoff * 2 : 12e4, 9e5);
      throw new Error(`usage endpoint HTTP 429 (backing off to ${usageBackoff / 1e3}s)`);
    }
    if (res.status === 401 || res.status === 403) {
      authDeadToken = cred.token;
      throw new Error(`usage endpoint HTTP ${res.status} \u2014 waiting for refresh`, { cause: "auth" });
    }
    usageBackoff = 0;
    if (!res.ok) throw new Error(`usage endpoint HTTP ${res.status}`);
    authWait = false;
    authDeadToken = null;
    const j = await res.json();
    if (!state.loggedRaw) {
      state.loggedRaw = true;
      log("usage raw shape:", JSON.stringify(j).slice(0, 1200));
    }
    const limits = Array.isArray(j.limits) ? j.limits : [];
    const fromLimit = (kind) => {
      const l = limits.find((x) => x.kind === kind);
      return l ? { pct: l.percent, resetsAt: l.resets_at } : null;
    };
    const scoped = limits.find((x) => x.kind === "weekly_scoped");
    const models = [];
    for (const l of limits) {
      if (l.kind !== "weekly_scoped") continue;
      const name = l.scope?.model?.display_name;
      if (name && typeof l.percent === "number") models.push({ name, pct: l.percent, resetsAt: l.resets_at ?? null });
    }
    for (const [key, name] of [["seven_day_opus", "Opus"], ["seven_day_sonnet", "Sonnet"]]) {
      const b = pickBucket(j[key]);
      if (b?.pct != null && !models.some((m) => m.name === name)) models.push({ name, pct: b.pct, resetsAt: b.resetsAt });
    }
    state.usage = {
      fiveHour: pickBucket(j.five_hour) ?? fromLimit("session"),
      weekly: pickBucket(j.seven_day) ?? fromLimit("weekly_all"),
      weeklyOpus: pickBucket(j.seven_day_opus),
      scopedPct: scoped?.percent ?? null,
      scopedName: scoped?.scope?.model?.display_name ?? null,
      models
    };
    state.usageErr = null;
    lastUsageErrLogged = null;
    state.usageAt = Date.now();
    const fp5 = state.usage.fiveHour?.pct;
    if (typeof fp5 === "number") {
      state.pctHistory.push({ t: state.usageAt, pct: fp5 });
      state.pctHistory = state.pctHistory.filter((h) => state.usageAt - h.t < 36e5);
    }
    try {
      fs.writeFileSync(CACHE_FILE, JSON.stringify({ usage: state.usage, at: state.usageAt }));
    } catch {
    }
    log(`usage: 5h=${state.usage.fiveHour?.pct ?? "?"}% wk=${state.usage.weekly?.pct ?? "?"}% next=${nextUsageDelay() / 1e3}s`);
    scheduleResetPoll();
  } catch (e) {
    authWait = e.cause === "auth";
    state.usageErr = String(e.message ?? e);
    if (state.usageErr !== lastUsageErrLogged) {
      lastUsageErrLogged = state.usageErr;
      log("usage poll failed:", state.usageErr);
    }
  }
  renderAll(["usage-session", "usage-weekly", "usage-model", "burn-rate"]);
}
var resetTimer = null;
function scheduleResetPoll() {
  const deltas = [state.usage?.fiveHour?.resetsAt, state.usage?.weekly?.resetsAt].filter(Boolean).map((iso) => new Date(iso).getTime() - Date.now()).filter((d) => d > 0 && d < 6 * 36e5);
  if (!deltas.length) return;
  clearTimeout(resetTimer);
  resetTimer = setTimeout(pollUsage, Math.min(...deltas) + 8e3);
}
function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
var isAgentSession = (s) => typeof s.entrypoint === "string" && s.entrypoint.startsWith("sdk");
async function pollSessions() {
  try {
    const files = await fsp.readdir(SESSIONS_DIR).catch(() => []);
    const out = [];
    let agents = 0;
    for (const f of files) {
      if (!f.endsWith(".json")) continue;
      try {
        const s = JSON.parse(await fsp.readFile(path.join(SESSIONS_DIR, f), "utf8"));
        if (!s.pid || !pidAlive(s.pid)) continue;
        if (isAgentSession(s)) agents++;
        else out.push(s);
      } catch {
      }
    }
    out.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
    const before = new Map(state.sessions.map((s) => [s.pid, s]));
    for (const s of out) {
      const was = before.get(s.pid);
      if (!was) pushLog("start", s.name, "opened");
      else if (was.status !== s.status) pushLog(s.status && s.status !== "idle" ? "busy" : "idle", s.name, s.status ?? "?");
    }
    for (const [pid, s] of before) if (!out.some((x) => x.pid === pid)) pushLog("end", s.name, "closed");
    const changed = agents !== state.agents || JSON.stringify(out.map((s) => [s.pid, s.status])) !== JSON.stringify(state.sessions.map((s) => [s.pid, s.status]));
    state.sessions = out;
    state.agents = agents;
    if (changed) renderAll(["sessions", "focus-session"]);
  } catch (e) {
    log("sessions poll failed:", String(e));
  }
}
var fileCache = /* @__PURE__ */ new Map();
var localDay = (ts) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
async function pollToday() {
  try {
    const day = localDay(Date.now());
    const dayStart = /* @__PURE__ */ new Date();
    dayStart.setHours(0, 0, 0, 0);
    let msgs = 0, tokens = 0;
    const chats = /* @__PURE__ */ new Set();
    const dirs = await fsp.readdir(PROJECTS_DIR).catch(() => []);
    for (const d of dirs) {
      const dir = path.join(PROJECTS_DIR, d);
      let files;
      try {
        files = await fsp.readdir(dir);
      } catch {
        continue;
      }
      for (const f of files) {
        if (!f.endsWith(".jsonl")) continue;
        const fp = path.join(dir, f);
        let st;
        try {
          st = await fsp.stat(fp);
        } catch {
          continue;
        }
        if (st.mtimeMs < dayStart.getTime()) continue;
        chats.add(fp);
        const cached = fileCache.get(fp);
        if (cached && cached.size === st.size && cached.day === day) {
          msgs += cached.msgs;
          tokens += cached.tokens;
          continue;
        }
        let fMsgs = 0, fTokens = 0;
        try {
          const text = await fsp.readFile(fp, "utf8");
          const reqTok = /* @__PURE__ */ new Map();
          const seenMsg = /* @__PURE__ */ new Set();
          for (const line of text.split("\n")) {
            if (!line) continue;
            let j;
            try {
              j = JSON.parse(line);
            } catch {
              continue;
            }
            if (!j.timestamp || localDay(j.timestamp) !== day) continue;
            const mid = j.message?.id ?? j.requestId;
            if (j.type === "user") fMsgs++;
            else if (j.type === "assistant" && (!mid || !seenMsg.has(mid))) {
              if (mid) seenMsg.add(mid);
              fMsgs++;
            }
            const u = j.message?.usage;
            if (!u) continue;
            const tok = (u.input_tokens ?? 0) + (u.output_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
            if (mid) reqTok.set(mid, Math.max(reqTok.get(mid) ?? 0, tok));
            else fTokens += tok;
          }
          for (const tok of reqTok.values()) fTokens += tok;
        } catch {
          continue;
        }
        fileCache.set(fp, { size: st.size, day, msgs: fMsgs, tokens: fTokens });
        msgs += fMsgs;
        tokens += fTokens;
      }
    }
    state.today = { chats: chats.size, msgs, tokens };
    renderAll(["today"]);
  } catch (e) {
    log("today poll failed:", String(e));
  }
}
var weekCache = /* @__PURE__ */ new Map();
var lastWeekPoll = 0;
var chartMetric = "tokens";
var DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
function weekDayKeys() {
  const d = /* @__PURE__ */ new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (CHART_DAYS - 1));
  const out = [];
  for (let i = 0; i < CHART_DAYS; i++) {
    out.push({ day: localDay(d.getTime()), label: DOW[d.getDay()] });
    d.setDate(d.getDate() + 1);
  }
  return out;
}
async function scanWeekFile(fp, wanted) {
  const out = {};
  const bucket = (day) => out[day] ??= { tokens: 0, msgs: 0 };
  let text;
  try {
    text = await fsp.readFile(fp, "utf8");
  } catch {
    return out;
  }
  const reqs = /* @__PURE__ */ new Map();
  const seenMsg = /* @__PURE__ */ new Set();
  for (const line of text.split("\n")) {
    if (!line) continue;
    let j;
    try {
      j = JSON.parse(line);
    } catch {
      continue;
    }
    if (!j.timestamp) continue;
    const day = localDay(j.timestamp);
    if (!wanted.has(day)) continue;
    const mid = j.message?.id ?? j.requestId;
    if (j.type === "user") bucket(day).msgs++;
    else if (j.type === "assistant" && (!mid || !seenMsg.has(mid))) {
      if (mid) seenMsg.add(mid);
      bucket(day).msgs++;
    }
    const u = j.message?.usage;
    if (!u) continue;
    const tok = (u.input_tokens ?? 0) + (u.output_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
    if (!mid) {
      bucket(day).tokens += tok;
      continue;
    }
    const r = reqs.get(mid);
    if (r) r.tok = Math.max(r.tok, tok);
    else reqs.set(mid, { day, tok });
  }
  for (const r of reqs.values()) bucket(r.day).tokens += r.tok;
  return out;
}
async function pollWeek() {
  lastWeekPoll = Date.now();
  try {
    const keys = weekDayKeys();
    const from = keys[0].day;
    const wanted = new Set(keys.map((k) => k.day));
    const start = /* @__PURE__ */ new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (CHART_DAYS - 1));
    const startMs = start.getTime();
    const totals = new Map(keys.map((k) => [k.day, { tokens: 0, msgs: 0 }]));
    const dirs = await fsp.readdir(PROJECTS_DIR).catch(() => []);
    for (const dname of dirs) {
      const dir = path.join(PROJECTS_DIR, dname);
      let files;
      try {
        files = await fsp.readdir(dir);
      } catch {
        continue;
      }
      for (const f of files) {
        if (!f.endsWith(".jsonl")) continue;
        const fp = path.join(dir, f);
        let st;
        try {
          st = await fsp.stat(fp);
        } catch {
          continue;
        }
        if (st.mtimeMs < startMs) continue;
        let c = weekCache.get(fp);
        if (!c || c.size !== st.size || c.from !== from) {
          c = { size: st.size, from, days: await scanWeekFile(fp, wanted) };
          weekCache.set(fp, c);
        }
        for (const [day, b] of Object.entries(c.days)) {
          const t = totals.get(day);
          if (!t) continue;
          t.tokens += b.tokens;
          t.msgs += b.msgs;
        }
      }
    }
    for (const fp of weekCache.keys()) {
      if (weekCache.get(fp).from !== from) weekCache.delete(fp);
    }
    const today = localDay(Date.now());
    state.week = {
      days: keys.map((k) => ({ ...k, ...totals.get(k.day), isToday: k.day === today })),
      at: Date.now()
    };
    renderAll(["chart-cell", "chart-open"]);
  } catch (e) {
    log("week poll failed:", String(e));
  }
}
var hourTracker = /* @__PURE__ */ new Map();
var burnPrimed = false;
async function pollBurn() {
  try {
    const now = Date.now();
    const scanCutoff = now - 90 * 6e4;
    const fresh = /* @__PURE__ */ new Map();
    const dirs = await fsp.readdir(PROJECTS_DIR).catch(() => []);
    for (const d of dirs) {
      const dir = path.join(PROJECTS_DIR, d);
      let files;
      try {
        files = await fsp.readdir(dir);
      } catch {
        continue;
      }
      for (const f of files) {
        if (!f.endsWith(".jsonl")) continue;
        const fp = path.join(dir, f);
        let st;
        try {
          st = await fsp.stat(fp);
        } catch {
          continue;
        }
        if (st.mtimeMs < scanCutoff) continue;
        let rec = hourTracker.get(fp);
        if (!rec || st.size < rec.offset || !rec.seen) rec = { offset: 0, rest: "", events: [], seen: /* @__PURE__ */ new Map() };
        if (st.size > rec.offset) {
          const fh = await fsp.open(fp, "r");
          try {
            const len = st.size - rec.offset;
            const buf = Buffer.alloc(len);
            await fh.read(buf, 0, len, rec.offset);
            rec.offset = st.size;
            const lines = (rec.rest + buf.toString("utf8")).split("\n");
            rec.rest = lines.pop() ?? "";
            for (const line of lines) {
              if (!line) continue;
              let j;
              try {
                j = JSON.parse(line);
              } catch {
                continue;
              }
              const u = j.message?.usage;
              if (!u || !j.timestamp) continue;
              const tok = (u.input_tokens ?? 0) + (u.output_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
              if (!tok) continue;
              const mid = j.message?.id ?? j.requestId;
              const ev = mid && rec.seen.get(mid);
              if (ev) {
                ev.tok = Math.max(ev.tok, tok);
                continue;
              }
              const e = { t: new Date(j.timestamp).getTime(), tok };
              if (mid) rec.seen.set(mid, e);
              rec.events.push(e);
              fresh.set(d, (fresh.get(d) ?? 0) + tok);
            }
          } finally {
            await fh.close();
          }
        }
        rec.events = rec.events.filter((e) => now - e.t < 65 * 6e4);
        for (const [mid, ev] of rec.seen) if (now - ev.t >= 65 * 6e4) rec.seen.delete(mid);
        hourTracker.set(fp, rec);
      }
    }
    if (burnPrimed) {
      for (const [dir, tok] of [...fresh.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2))
        pushLog("tok", dir.split("-").filter(Boolean).pop() ?? "claude", `+${fmtNum(tok)} tok`);
    }
    burnPrimed = true;
    let tokensHour = 0;
    for (const rec of hourTracker.values()) for (const e of rec.events) if (now - e.t < 36e5) tokensHour += e.tok;
    state.burn = { tokensHour, at: now };
    renderAll(["burn-rate"]);
  } catch (e) {
    log("burn poll failed:", String(e));
  }
}
function sessionEta() {
  const h = state.pctHistory;
  if (h.length < 2) return "measuring\u2026";
  const latest = h[h.length - 1];
  const past = h.find((s) => latest.t - s.t >= 10 * 6e4) ?? h[0];
  const dt = latest.t - past.t;
  if (dt < 4 * 6e4) return "measuring\u2026";
  const slope = (latest.pct - past.pct) / dt;
  if (slope <= 5e-8) return "steady";
  const msLeft = (100 - latest.pct) / slope;
  const resetMs = state.usage?.fiveHour?.resetsAt ? new Date(state.usage.fiveHour.resetsAt).getTime() - latest.t : Infinity;
  if (msLeft >= resetMs) return "resets first";
  const hh = Math.floor(msLeft / 36e5), mm = Math.round(msLeft % 36e5 / 6e4);
  return hh > 0 ? `cap in ~${hh}h ${mm}m` : `cap in ~${mm}m`;
}
function argOf(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : void 0;
}
var views = /* @__PURE__ */ new Map();
var cycle = /* @__PURE__ */ new Map();
var focusIdx = /* @__PURE__ */ new Map();
var deviceTypes = /* @__PURE__ */ new Map();
var ws = null;
var animPhase = 0;
var pluginUUID = null;
var CHART_PROFILE = "Claude 7-Day Chart";
var DEVICE_XL = 2;
function send(obj) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
}
var setImage = (context, image) => send({ event: "setImage", context, payload: { image, target: 0 } });
var setTitle = (context) => send({ event: "setTitle", context, payload: { title: "", target: 0 } });
var showOk = (context) => send({ event: "showOk", context });
var showAlert = (context) => send({ event: "showAlert", context });
var switchProfile = (device, profile) => send({ event: "switchToProfile", context: pluginUUID, device, payload: profile ? { profile } : {} });
var kindOf = (action) => action.replace("com.technicallybrantley.claude-deck.", "");
function usageErrSub() {
  const e = state.usageErr ?? "";
  if (e.includes("429")) return "throttled";
  if (authWait) return "auth refreshing\u2026";
  if (!state.usageErr) return "no data";
  return "unavailable";
}
var USAGE_STALE_MS = 4 * 6e4;
function usageStale() {
  if (!state.usageAt) return null;
  const age = Date.now() - state.usageAt;
  if (age < USAGE_STALE_MS) return null;
  return age < 36e5 ? `${Math.round(age / 6e4)}m old` : `${Math.round(age / 36e5)}h old`;
}
function render(context, kind) {
  switch (kind) {
    case "usage-session": {
      const b = state.usage?.fiveHour;
      if (!b) return setImage(context, gaugeKey("SESSION 5H", null, usageErrSub()));
      if (b.pct >= 100 && b.resetsAt) return setImage(context, capKey("SESSION CAP", b.resetsAt, CAP_5H, animPhase));
      return setImage(context, gaugeKey("SESSION 5H", b.pct ?? null, usageStale() ?? fmtReset(b.resetsAt), b.pct >= 90 ? animPhase : null));
    }
    case "usage-weekly": {
      const b = state.usage?.weekly;
      if (!b) return setImage(context, gaugeKey("WEEKLY", null, usageErrSub()));
      if (b.pct >= 100 && b.resetsAt) return setImage(context, capKey("WEEKLY CAP", b.resetsAt, CAP_7D, animPhase));
      const u = state.usage;
      const sub = usageStale() ?? (u?.scopedPct != null && u.scopedName ? `${u.scopedName} ${Math.round(u.scopedPct)}%` : u?.weeklyOpus?.pct != null ? `opus ${Math.round(u.weeklyOpus.pct)}%` : fmtReset(b.resetsAt));
      return setImage(context, gaugeKey("WEEKLY", b.pct ?? null, sub, b.pct >= 90 ? animPhase : null));
    }
    case "usage-model": {
      const models = state.usage?.models ?? [];
      const want = views.get(context)?.settings?.model;
      const m = models.find((x) => x.name === want) ?? models[0];
      const name = (m?.name ?? want ?? "MODEL").toUpperCase().slice(0, 8);
      if (m?.pct >= 100 && m.resetsAt) return setImage(context, capKey(`${name} CAP`, m.resetsAt, CAP_7D, animPhase));
      if (!m) return setImage(context, gaugeKey(`${name} 7D`, null, usageErrSub()));
      return setImage(context, gaugeKey(`${name} 7D`, m.pct ?? null, usageStale() ?? (m.resetsAt ? fmtReset(m.resetsAt) : "no data"), m.pct >= 90 ? animPhase : null));
    }
    case "burn-rate":
      return setImage(context, burnKey(state.burn?.tokensHour ?? null, sessionEta()));
    case "project": {
      const s = views.get(context)?.settings ?? {};
      const label = s.label || (s.path ? path.basename(s.path) : "");
      return setImage(context, labelKey("PROJECT", label || "configure", s.path ? "" : "set folder in settings"));
    }
    case "focus-session": {
      const i = focusIdx.get(context);
      const s = i != null && state.sessions.length ? state.sessions[i % state.sessions.length] : null;
      return setImage(context, labelKey("FOCUS", s ? s.name : `${state.sessions.length} sessions`, s ? s.status : "press to cycle", C.ok));
    }
    case "quick-prompt": {
      const s = views.get(context)?.settings ?? {};
      return setImage(context, labelKey("PROMPT", s.label || "configure", s.prompt ? "" : "set prompt in settings"));
    }
    case "custom": {
      const s = views.get(context)?.settings ?? {};
      return setImage(context, labelKey("CLAUDE", s.label || "custom", s.command ? "" : "set command in settings"));
    }
    case "sessions": {
      const cy = cycle.get(context);
      const n = state.sessions.length;
      if (cy && cy.idx >= 0 && state.sessions[cy.idx]) {
        const s = state.sessions[cy.idx];
        const status = s.status ?? "?";
        return setImage(context, linesKey(`${cy.idx + 1}/${n}`, [
          { text: (s.name ?? "session").slice(0, 11), big: false, color: C.text },
          { text: status, color: status === "idle" ? C.dim : C.ok },
          { text: fmtAgo(s.startedAt ?? Date.now()) + " old", color: C.dim }
        ]));
      }
      const busy = state.sessions.filter((s) => s.status && s.status !== "idle").length;
      const a = state.agents;
      const sub = n === 0 ? a > 0 ? `${a} sdk only` : "none running" : (busy > 0 ? `${busy} working` : "all idle") + (a > 0 ? ` +${a} sdk` : "");
      return setImage(context, bigCountKey("CLAUDE CODE", n, sub, busy > 0 ? C.ok : C.dim, busy > 0 ? animPhase : null, a > 0 ? 15 : 17));
    }
    case "activity":
    case "term":
    case "life":
    case "history":
    case "pipes":
      return renderTiles(kind, false);
    case "chart-open":
      return setImage(context, chartOpenKey(state.week?.days ?? [], chartMetric));
    case "chart-cell": {
      const c = views.get(context)?.coords ?? { column: 0, row: 0 };
      return setImage(context, chartCell(c.column, c.row));
    }
    case "today": {
      const t = state.today;
      return setImage(context, linesKey("TODAY", [
        { text: `${t?.chats ?? "--"} chats`, color: C.text },
        { text: `${fmtNum(t?.msgs)} msgs`, color: C.text },
        { text: `${fmtNum(t?.tokens)} tok`, color: C.accent }
      ]));
    }
  }
}
function chartCell(column, row) {
  const days = state.week?.days ?? [];
  const metric = chartMetric;
  const unit = metric === "msgs" ? "msgs" : "tokens";
  if (column < CHART_DAYS) {
    const d = days[column];
    if (!d) return chartStatKey("", "--", row === CHART_ROWS - 1 ? "no data" : "", C.dim);
    const max = Math.max(...days.map((x) => dayVal(x, metric)), 1);
    return barCellKey(d, row, max, metric);
  }
  if (row === CHART_ROWS - 1) return backCellKey();
  const vals = days.map((d) => dayVal(d, metric));
  const total = vals.reduce((a, b) => a + b, 0);
  if (row === 0) return chartStatKey("7-DAY TOTAL", fmtNum(total), unit);
  if (row === 1) {
    const peak = vals.length ? Math.max(...vals) : 0;
    const on = days[vals.indexOf(peak)];
    return chartStatKey("PEAK DAY", fmtNum(peak), on ? on.label.toLowerCase() : "", C.accentHi);
  }
  return chartStatKey("PER DAY", fmtNum(Math.round(total / (vals.length || 1))), "avg " + unit, C.text);
}
function renderAll(kinds) {
  for (const [context, v] of views) if (kinds.includes(v.kind)) render(context, v.kind);
}
var TILE_KINDS = ["activity", "term", "life", "history", "pipes", "scuttle"];
var TILE_SPEC = {
  activity: { ms: 110, idleMs: 0 },
  pipes: { ms: 130, idleMs: 0 },
  life: { ms: 220, idleMs: 0 },
  term: { ms: 120, idleMs: 260 },
  // keeps typing/blinking even when quiet
  history: { ms: 400, idleMs: 1200 },
  // the graph should keep scrolling
  scuttle: { ms: 140, idleMs: 0 }
  // walks while Claude works, then naps
};
var tilesT0 = Date.now();
var tilesPaused = false;
var tileRunning = /* @__PURE__ */ new Set();
var tileLast = /* @__PURE__ */ new Map();
var sims = /* @__PURE__ */ new Map();
var SPR_PX = 12;
var SPR_PY = 16;
var SPRITE_DEFAULT = {
  body: C.accent,
  //         0123456789A
  walkA: [
    "  #     #  ",
    "  #######  ",
    " ##=###=## ",
    " ######### ",
    "# #  #  # #"
  ],
  walkB: [
    " #       # ",
    "  #######  ",
    " ##=###=## ",
    " ######### ",
    " ## # # ## "
  ],
  // Eyes closed (no '=' notches), antennae down, legs tucked: the single frame
  // held while nothing is running.
  sleep: [
    "   #   #   ",
    "  #######  ",
    " ######### ",
    " ######### ",
    "  ##   ##  "
  ],
  agent: [
    "  #  ",
    " ### ",
    " # # "
  ]
};
var SPRITE = SPRITE_DEFAULT;
try {
  const s = JSON.parse(fs.readFileSync(path.join(PLUGIN_DIR, "sprite.json"), "utf8"));
  const rows = (a) => Array.isArray(a) && a.length && a.every((r) => typeof r === "string");
  if (["walkA", "walkB", "sleep"].every((k) => rows(s[k]) && s[k].every((r) => r.length === s.walkA[0].length))) {
    SPRITE = { ...SPRITE_DEFAULT, ...s };
    log("sprite: local override loaded");
  } else log("sprite: local override ignored (malformed)");
} catch {
}
var sprW = () => SPRITE.walkA[0].length;
var sprFlip = (rows) => rows.map((r) => [...r].reverse().map((c) => c === "(" ? ")" : c === ")" ? "(" : c).join(""));
function sprDraw(rows, x0, y0, px, py, ox, color) {
  const fill = color ?? SPRITE.body;
  const R = (rx, ry, rw, rh) => `<rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" fill="${fill}"/>`;
  x0 = Math.round(x0);
  y0 = Math.round(y0);
  let out = "";
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < rows[r].length; c++) {
      const ch = rows[r][c];
      if (ch === " ") continue;
      const x = x0 + c * px - ox, y = y0 + r * py;
      if (x > KEY + 1 || x + px < -1) continue;
      const hx = px >> 1, hy = py >> 1;
      if (ch === "#") out += R(x, y, px, py);
      else if (ch === "=") out += R(x, y + hy, px, hy);
      else if (ch === "(") out += R(x + hx, y + hy, hx, hy);
      else if (ch === ")") out += R(x, y + hy, hx, hy);
    }
  }
  return out;
}
var smoother = (u) => u * u * u * (u * (u * 6 - 15) + 10);
var sprHomeX = (c) => c * KEY + Math.round((KEY - sprW() * SPR_PX) / 2);
var sprHomeY = (r) => r * KEY + Math.round((KEY - SPRITE.walkA.length * SPR_PY) / 2);
var sprPos = (sim) => {
  const e = smoother(sim.t);
  return [
    sprHomeX(sim.col) + (sprHomeX(sim.tcol) - sprHomeX(sim.col)) * e,
    sprHomeY(sim.row) + (sprHomeY(sim.trow) - sprHomeY(sim.row)) * e
  ];
};
var sprStepping = (sim) => sim.t > 0 || sim.cols < 2 && sim.rows < 2;
function sprAim(sim) {
  if (sim.rows < 2 || Math.random() < 0.72) {
    let c = sim.col + sim.dir;
    if (c < 0 || c >= sim.cols) {
      sim.dir *= -1;
      c = sim.col + sim.dir;
    }
    if (c >= 0 && c < sim.cols) {
      sim.tcol = c;
      sim.trow = sim.row;
      return true;
    }
  }
  const up = Math.random() < 0.5 ? 1 : -1;
  for (const d of [up, -up]) {
    const r = sim.row + d;
    if (r >= 0 && r < sim.rows) {
      sim.trow = r;
      sim.tcol = sim.col;
      return true;
    }
  }
  return false;
}
var ACT_ART = {
  heart: [" # # ", "#####", "#####", " ### ", "  #  "],
  excl: ["##", "##", "##", "  ", "##"],
  ball: [" ## ", "####", "####", " ## "],
  bubble: [" ## ", "#  #", "#  #", " ## "]
};
var ACT_LEN = { ball: 40, bubble: 30, jump: 12, heart: 24, excl: 12, spin: 12 };
var SPR_ACTS = Object.keys(ACT_LEN);
var rollAct = () => 40 + Math.floor(Math.random() * 120);
function scuttleStep(sim, busy) {
  const burn = state.burn?.tokensHour ?? 0;
  sim.phase++;
  if (sim.act) {
    if (++sim.actT >= ACT_LEN[sim.act]) {
      sim.act = null;
      sim.actNext = rollAct();
    }
    return;
  }
  sim.actNext--;
  if (sim.t === 0 && sim.actNext <= 0) {
    sim.act = SPR_ACTS[Math.floor(Math.random() * SPR_ACTS.length)];
    sim.actT = 0;
    return;
  }
  if (sim.t > 0) {
    sim.t = Math.min(1, sim.t + 0.1 + Math.min(0.09, burn / 1e8) + Math.min(0.03, busy * 6e-3));
    if (sim.t >= 1) {
      sim.col = sim.tcol;
      sim.row = sim.trow;
      sim.t = 0;
      sim.rest = 4 + Math.floor(Math.random() * 12);
    }
    return;
  }
  if (--sim.rest > 0) return;
  if (sprAim(sim)) sim.t = 1e-6;
}
function sprActArt(sim, x, y0, sw, sh, ox) {
  const a = sim.act, k = sim.actT;
  if (!a) return "";
  const mid = x + sw / 2, P = 6;
  if (a === "ball") {
    const bx = mid - 12 + Math.sin(k * 0.3) * 24;
    const by = y0 - 30 + Math.abs(Math.cos(k * 0.3)) * 14;
    return sprDraw(ACT_ART.ball, bx, by, P, P, ox, C.text);
  }
  if (a === "bubble") {
    if (k > ACT_LEN.bubble - 5) return "";
    return sprDraw(ACT_ART.bubble, mid - 12 + Math.sin(k * 0.22) * 10, y0 - 18 - k * 1.4, P, P, ox, C.ok);
  }
  if (a === "heart") return sprDraw(ACT_ART.heart, mid - 15 + Math.sin(k * 0.25) * 4, y0 - 26 - k * 0.7, P, P, ox, C.bad);
  if (a === "excl") return sprDraw(ACT_ART.excl, mid - 6, y0 - 34 + (k < 3 ? (3 - k) * 6 : 0), P, P, ox, C.warn);
  return "";
}
function scuttleCellKey(lc, lr, cols, rows, t, sim, busy) {
  const ox = lc * KEY, sw = sprW() * SPR_PX, sh = SPRITE.walkA.length * SPR_PY;
  const walking = busy > 0;
  if (!walking) {
    if (sim.t > 0.5) {
      sim.col = sim.tcol;
      sim.row = sim.trow;
    }
    sim.tcol = sim.col;
    sim.trow = sim.row;
    sim.t = 0;
    sim.act = null;
  }
  const [x, ry] = sprPos(sim);
  const stepping = walking && !sim.act && sprStepping(sim) && sim.phase % 2;
  const hop = sim.act === "jump" ? -Math.round(Math.sin(sim.actT / ACT_LEN.jump * Math.PI) * 24) : 0;
  const bob = stepping ? -2 : 0;
  const y0 = ry + bob + hop - lr * KEY;
  let pose = !walking ? SPRITE.sleep : stepping ? SPRITE.walkB : SPRITE.walkA;
  let agent = SPRITE.agent;
  const facing = sim.act === "spin" ? sim.actT % 2 ? -sim.dir : sim.dir : sim.dir;
  if (facing < 0) {
    pose = sprFlip(pose);
    agent = sprFlip(agent);
  }
  let out = sprDraw(pose, x, y0, SPR_PX, SPR_PY, ox);
  if (walking) out += sprActArt(sim, x, y0, sw, sh, ox);
  for (let i = 1; walking && i <= Math.min(3, state.agents ?? 0); i++) {
    const ax = x - sim.dir * (sw * 0.5 + i * 40);
    out += sprDraw(agent, ax, y0 + SPR_PY * 2, 8, 12, ox);
  }
  if (!walking) {
    const zx = x + (sim.dir > 0 ? sw - 6 : -14) - ox;
    if (zx > -20 && zx < KEY + 20)
      out += `<text x="${zx.toFixed(1)}" y="${(y0 + 6).toFixed(1)}" font-family="${MONO}" font-size="18" fill="${C.dim}">z</text>`;
  }
  const id = lc + "," + lr;
  if (!out) {
    if (!sim.painted.has(id)) return null;
    sim.painted.delete(id);
    return svgWrap("", false);
  }
  sim.painted.add(id);
  return svgWrap(out, false);
}
function simFor(kind, key, cols, rows) {
  let s = sims.get(key);
  if (s) return s;
  const W = cols * KEY, H = rows * KEY;
  if (kind === "life") {
    const w = Math.max(4, Math.floor(W / LIFE_CELL)), h = Math.max(4, Math.floor(H / LIFE_CELL));
    s = { w, h, cur: new Uint8Array(w * h), prev: null, pop: 0, stale: 0 };
    lifeSeed(s, 1);
  } else if (kind === "pipes") {
    s = { w: Math.max(3, Math.floor(W / PIPE_CELL)), h: Math.max(3, Math.floor(H / PIPE_CELL)), pipes: [], cells: 0, fade: 0 };
  } else if (kind === "history") {
    s = { bucketMs: 3e4 };
  } else if (kind === "scuttle") {
    s = {
      col: 0,
      row: rows - 1,
      tcol: 0,
      trow: rows - 1,
      t: 0,
      rest: 1,
      dir: 1,
      phase: 0,
      cols,
      rows,
      painted: /* @__PURE__ */ new Set(),
      act: null,
      actT: 0,
      actNext: rollAct()
    };
  } else s = {};
  sims.set(key, s);
  return s;
}
function tileStep(kind, sim, busy) {
  if (kind === "life") lifeStep(sim, busy);
  else if (kind === "pipes") pipeStep(sim, busy);
  else if (kind === "scuttle") scuttleStep(sim, busy);
}
function tileCell(kind, lc, lr, cols, rows, t, sim, busy, burn) {
  switch (kind) {
    case "activity":
      return rainCellKey(lc, lr, cols, rows, t, busy, burn);
    case "term":
      return termCellKey(lc, lr, cols, rows, t);
    case "life":
      return lifeCellKey(lc, lr, cols, rows, t, sim);
    case "history":
      return historyCellKey(lc, lr, cols, rows, t, sim);
    case "pipes":
      return pipesCellKey(lc, lr, cols, rows, t, sim);
    case "scuttle":
      return scuttleCellKey(lc, lr, cols, rows, t, sim, busy);
  }
}
function renderTiles(kind, step) {
  const groups = /* @__PURE__ */ new Map();
  for (const [context, v] of views) {
    if (v.kind !== kind) continue;
    const key = v.device ?? "";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push([context, v]);
  }
  if (!groups.size) return;
  const t = Date.now() - tilesT0;
  const busy = tilesPaused ? 0 : state.sessions.filter((s) => s.status && s.status !== "idle").length;
  const burn = state.burn?.tokensHour ?? 0;
  for (const [device, group] of groups) {
    let minC = Infinity, minR = Infinity, maxC = -Infinity, maxR = -Infinity;
    for (const [, v] of group) {
      minC = Math.min(minC, v.coords.column);
      maxC = Math.max(maxC, v.coords.column);
      minR = Math.min(minR, v.coords.row);
      maxR = Math.max(maxR, v.coords.row);
    }
    const cols = maxC - minC + 1, rows = maxR - minR + 1;
    const sim = simFor(kind, `${kind}|${device}|${cols}x${rows}`, cols, rows);
    if (step) tileStep(kind, sim, busy);
    for (const [context, v] of group) {
      const img = tileCell(kind, v.coords.column - minC, v.coords.row - minR, cols, rows, t, sim, busy, burn);
      if (img) setImage(context, img);
    }
  }
}
function launchDesktop(context) {
  const child = spawn("explorer.exe", [desktopAppId], { detached: true, stdio: "ignore" });
  child.on("error", () => showAlert(context));
  child.unref();
  showOk(context);
}
function quickChat(context) {
  const ps = `
Add-Type -Namespace K -Name W -MemberDefinition '[DllImport("user32.dll")] public static extern void keybd_event(byte k, byte s, uint f, UIntPtr e);';
[K.W]::keybd_event(0x11,0,0,[UIntPtr]::Zero); [K.W]::keybd_event(0x12,0,0,[UIntPtr]::Zero); [K.W]::keybd_event(0x20,0,0,[UIntPtr]::Zero);
Start-Sleep -Milliseconds 60;
[K.W]::keybd_event(0x20,0,2,[UIntPtr]::Zero); [K.W]::keybd_event(0x12,0,2,[UIntPtr]::Zero); [K.W]::keybd_event(0x11,0,2,[UIntPtr]::Zero);`;
  const child = spawn("powershell.exe", ["-NoProfile", "-WindowStyle", "Hidden", "-Command", ps], { detached: true, stdio: "ignore" });
  child.on("error", () => showAlert(context));
  child.unref();
  showOk(context);
}
function openWeb(context) {
  const child = spawn("cmd.exe", ["/c", "start", "", "https://claude.ai/new"], { detached: true, stdio: "ignore" });
  child.on("error", () => showAlert(context));
  child.unref();
  showOk(context);
}
function openTerminalAt(dir, context) {
  const psFallback = () => {
    const fb = spawn("cmd.exe", ["/c", "start", "", "powershell", "-NoExit", "-Command", `cd '${dir}'; claude`], { detached: true, stdio: "ignore" });
    fb.on("error", () => showAlert(context));
    fb.unref();
  };
  const wt = spawn("cmd.exe", ["/c", "start", "", "wt", "-w", "new", "-d", dir, "powershell", "-NoExit", "-Command", "claude"], { detached: true, stdio: "ignore" });
  wt.on("error", psFallback);
  wt.on("exit", (code) => {
    if (code !== 0) psFallback();
  });
  wt.unref();
  showOk(context);
}
function focusWindow(s, context) {
  const target = (String(s.name ?? "").replace(/["'‘’“”]/g, "").slice(0, 40) || path.basename(s.cwd ?? "")).toLowerCase();
  if (!target) return showAlert(context);
  const ps = `
$target = '${target.replace(/'/g, "''")}';
Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; using System.Text; public class W { public delegate bool EP(IntPtr h, IntPtr l); [DllImport("user32.dll")] public static extern bool EnumWindows(EP cb, IntPtr l); [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n); [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h); [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h); [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c); }';
$found = [IntPtr]::Zero;
[void][W]::EnumWindows({ param($h, $l) $sb = New-Object System.Text.StringBuilder 512; [void][W]::GetWindowText($h, $sb, 512); if ([W]::IsWindowVisible($h) -and $sb.ToString().ToLower().Contains($target)) { $script:found = $h; return $false }; return $true }, [IntPtr]::Zero);
if ($found -eq [IntPtr]::Zero) { exit 1 };
[void][W]::ShowWindow($found, 9); [void][W]::SetForegroundWindow($found); exit 0`;
  execFile("powershell.exe", ["-NoProfile", "-WindowStyle", "Hidden", "-Command", ps], (err) => {
    if (err) showAlert(context);
    else showOk(context);
  });
}
function sendPrompt(text, enter, context) {
  const ps = `
Set-Clipboard -Value '${String(text).replace(/'/g, "''")}';
Add-Type -Namespace K -Name W -MemberDefinition '[DllImport("user32.dll")] public static extern void keybd_event(byte k, byte s, uint f, UIntPtr e);';
function P([byte]$k){[K.W]::keybd_event($k,0,0,[UIntPtr]::Zero)}; function R([byte]$k){[K.W]::keybd_event($k,0,2,[UIntPtr]::Zero)};
P 0x11; P 0x12; P 0x20; Start-Sleep -Milliseconds 60; R 0x20; R 0x12; R 0x11;
Start-Sleep -Milliseconds 800;
P 0x11; P 0x56; Start-Sleep -Milliseconds 60; R 0x56; R 0x11;
${enter ? "Start-Sleep -Milliseconds 200; P 0x0D; R 0x0D;" : ""}`;
  const child = spawn("powershell.exe", ["-NoProfile", "-WindowStyle", "Hidden", "-Command", ps], { detached: true, stdio: "ignore" });
  child.on("error", () => showAlert(context));
  child.unref();
  showOk(context);
}
function runCustom(command, context) {
  const child = spawn("cmd.exe", ["/c", "start", "", command], { detached: true, stdio: "ignore" });
  child.on("error", () => showAlert(context));
  child.unref();
  showOk(context);
}
function onKeyDown(context, kind, device) {
  switch (kind) {
    case "activity":
    case "term":
    case "life":
    case "history":
    case "pipes":
      tilesPaused = !tilesPaused;
      for (const k of TILE_KINDS) renderTiles(k, false);
      return showOk(context);
    case "chart-open": {
      if (!device) return showAlert(context);
      const type = deviceTypes.get(device);
      if (type != null && type !== DEVICE_XL) {
        log(`chart: device type ${type} is not XL, no bundled profile to switch to`);
        return showAlert(context);
      }
      if (Date.now() - lastWeekPoll > 15e3) pollWeek();
      return switchProfile(device, CHART_PROFILE);
    }
    case "chart-cell": {
      const c = views.get(context)?.coords ?? { column: 0, row: 0 };
      if (c.column >= CHART_DAYS && c.row === CHART_ROWS - 1) return switchProfile(device, null);
      if (c.column >= CHART_DAYS) {
        pollWeek();
        return showOk(context);
      }
      chartMetric = chartMetric === "tokens" ? "msgs" : "tokens";
      return renderAll(["chart-cell", "chart-open"]);
    }
    case "usage-session":
    case "usage-weekly":
      if (Date.now() - lastUsageAttempt > 3e4) pollUsage();
      return showOk(context);
    case "today":
      pollToday();
      return showOk(context);
    case "sessions": {
      const n = state.sessions.length;
      if (n === 0) return showAlert(context);
      const cy = cycle.get(context) ?? { idx: -1, timer: null };
      cy.idx = (cy.idx + 1) % n;
      if (cy.timer) clearTimeout(cy.timer);
      cy.timer = setTimeout(() => {
        cycle.set(context, { idx: -1, timer: null });
        render(context, "sessions");
      }, 4e3);
      cycle.set(context, cy);
      return render(context, "sessions");
    }
    case "usage-model":
      if (Date.now() - lastUsageAttempt > 3e4) pollUsage();
      return showOk(context);
    case "burn-rate":
      pollBurn();
      return showOk(context);
    case "project": {
      const s = views.get(context)?.settings ?? {};
      if (!s.path) return showAlert(context);
      return openTerminalAt(s.path, context);
    }
    case "focus-session": {
      const n = state.sessions.length;
      if (!n) return showAlert(context);
      const i = ((focusIdx.get(context) ?? -1) + 1) % n;
      focusIdx.set(context, i);
      focusWindow(state.sessions[i], context);
      return render(context, "focus-session");
    }
    case "quick-prompt": {
      const s = views.get(context)?.settings ?? {};
      if (!s.prompt) return showAlert(context);
      return sendPrompt(s.prompt, !!s.enter, context);
    }
    case "custom": {
      const s = views.get(context)?.settings ?? {};
      if (!s.command) return showAlert(context);
      return runCustom(s.command, context);
    }
    case "launch":
      return launchDesktop(context);
    case "quick-chat":
      return quickChat(context);
    case "open-web":
      return openWeb(context);
    case "claude-code":
      return openTerminalAt(DEFAULT_CODE_DIR, context);
  }
}
if (process.argv.includes("--selftest")) {
  (async () => {
    log("selftest: polling usage\u2026");
    await pollUsage();
    log("selftest usage:", state.usage ? JSON.stringify(state.usage) : `ERROR: ${state.usageErr}`);
    await pollSessions();
    log(
      `selftest sessions (${state.sessions.length} shown, ${state.agents} sdk agents hidden):`,
      state.sessions.map((s) => `${s.name}[${s.status}]`).join(", ") || "(none)"
    );
    await pollToday();
    log("selftest today:", JSON.stringify(state.today));
    await pollBurn();
    log("selftest burn:", JSON.stringify(state.burn), "eta:", sessionEta());
    const savedUsage = state.usage;
    log("selftest poll rate:");
    for (const [name, pct, dt] of [
      ["idle 12%", 12, 5 * 36e5],
      ["warm 80%", 80, 3 * 36e5],
      ["hot 97%", 97, 2 * 36e5],
      ["capped, 90s to reset", 100, 9e4],
      ["30s past reset", 100, -3e4],
      ["10m past reset (bounded)", 100, -10 * 6e4]
    ]) {
      state.usage = { fiveHour: { pct, resetsAt: new Date(Date.now() + dt).toISOString() } };
      log(`  ${name.padEnd(26)} -> ${nextUsageDelay() / 1e3}s`);
    }
    state.usage = savedUsage;
    const [savedBackoff, savedWait] = [usageBackoff, authWait];
    log("selftest auth handling:");
    usageBackoff = 9e5;
    authWait = true;
    log(`  ${"auth wait beats 429 backoff".padEnd(26)} -> ${nextUsageDelay() / 1e3}s`);
    authWait = false;
    log(`  ${"429 backoff alone".padEnd(26)} -> ${nextUsageDelay() / 1e3}s`);
    usageBackoff = savedBackoff;
    authWait = savedWait;
    const savedAt = state.usageAt;
    log("selftest stale label:");
    for (const [name, age] of [["fresh 30s", 3e4], ["8 min", 8 * 6e4], ["overnight 14h", 14 * 36e5]]) {
      state.usageAt = Date.now() - age;
      log(`  ${name.padEnd(26)} -> ${usageStale() ?? "(live, no label)"}`);
    }
    state.usageAt = savedAt;
    log("selftest scuttle (at rest, sprite must fit inside one key):");
    const sprSW = sprW() * SPR_PX, sprSH = SPRITE.walkA.length * SPR_PY;
    for (const [cols, rows] of [[1, 1], [4, 1], [2, 2], [3, 2], [8, 4]]) {
      const sim = simFor("scuttle", `selftest|scuttle|${cols}x${rows}`, cols, rows);
      const seen = /* @__PURE__ */ new Set();
      let bad = 0;
      for (let i = 0; i < 6e3; i++) {
        scuttleStep(sim, 2);
        if (sim.t !== 0) continue;
        const [x, y] = sprPos(sim);
        if (x < sim.col * KEY || x + sprSW > (sim.col + 1) * KEY || y < sim.row * KEY || y + sprSH > (sim.row + 1) * KEY) bad++;
        seen.add(`${sim.col},${sim.row}`);
      }
      log(`  ${`${cols}x${rows}`.padEnd(5)} ${bad ? `OFF-KEY ${bad}x` : "always on a key"}, reached ${seen.size}/${cols * rows} keys`);
    }
    const t0 = Date.now();
    await pollWeek();
    log(`selftest week (${Date.now() - t0}ms, ${weekCache.size} files):`);
    for (const d of state.week?.days ?? []) {
      const max = Math.max(...state.week.days.map((x) => x.tokens), 1);
      const bar = "#".repeat(Math.round(28 * (d.tokens / max)));
      log(`  ${d.day} ${d.label}${d.isToday ? "*" : " "} ${String(fmtNum(d.tokens)).padStart(6)} tok ${String(d.msgs).padStart(5)} msgs |${bar}`);
    }
    process.exit(0);
  })();
} else if (process.argv.includes("--preview")) {
  (async () => {
    const body = (uri) => decodeURIComponent(uri.slice(uri.indexOf(",") + 1)).replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");
    const place = (uri, x, y) => `<svg x="${x}" y="${y}" width="${KEY}" height="${KEY}" viewBox="0 0 ${KEY} ${KEY}">${body(uri)}</svg>`;
    const PITCH = KEY + 8;
    const label = (x, y, s) => `<text x="${x}" y="${y}" font-family="Segoe UI, sans-serif" font-size="19" fill="#9b96a8">${s}</text>`;
    let inner = "", w, h;
    const tile = process.argv.includes("--rain") ? "activity" : argOf("--tile");
    if (process.argv.includes("--cap")) {
      const now = Date.now();
      const cases = [
        ["session 2h41m", "SESSION CAP", now + (2 * 3600 + 41 * 60 + 7) * 1e3, CAP_5H],
        ["session 47m", "SESSION CAP", now + (47 * 60 + 12) * 1e3, CAP_5H],
        ["session 38s", "SESSION CAP", now + 38e3, CAP_5H],
        ["weekly 3d", "WEEKLY CAP", now + (3 * 86400 + 4 * 3600 + 31 * 60) * 1e3, CAP_7D],
        ["model 19h", "FABLE CAP", now + (19 * 3600 + 5 * 60) * 1e3, CAP_7D],
        ["past reset", "WEEKLY CAP", now - 5e3, CAP_7D]
      ];
      cases.forEach(([lbl, cap, at, win], i) => {
        inner += place(capKey(cap, new Date(at).toISOString(), win, i), i * PITCH, 40);
        inner += label(i * PITCH, 28, lbl);
      });
      w = cases.length * PITCH;
      h = 40 + KEY;
    } else if (tile) {
      await pollSessions();
      await pollBurn();
      const cols = Number(argOf("--cols") ?? 3), rows = Number(argOf("--rows") ?? 4);
      const busy = Number(argOf("--busy") ?? Math.max(1, state.sessions.filter((s) => s.status && s.status !== "idle").length));
      const burn = Number(argOf("--burn") ?? state.burn?.tokensHour ?? 0);
      state.log.forEach((l, i) => {
        l.t = Date.now() - (state.log.length - i) * 380;
      });
      const sim = simFor(tile, `preview|${tile}|${cols}x${rows}`, cols, rows);
      const nf = Math.max(1, Number(argOf("--frames") ?? 3));
      const frames = [...Array(nf)].map((_, i) => i * 400).concat([-1]);
      const blockW = cols * PITCH;
      const perFrame = Math.max(1, Math.round(400 / (TILE_SPEC[tile]?.ms ?? 140)));
      const forceAct = argOf("--act");
      frames.forEach((t, k) => {
        if (k > 0 && t >= 0) for (let i = 0; i < perFrame; i++) tileStep(tile, sim, busy);
        if (forceAct && t >= 0) {
          sim.act = forceAct;
          sim.actT = Math.min(k * 2, (ACT_LEN[forceAct] ?? 20) - 1);
        }
        const x0 = k * (blockW + 34);
        for (let c = 0; c < cols; c++)
          for (let r = 0; r < rows; r++) {
            const img = tileCell(tile, c, r, cols, rows, Math.max(0, t), sim, t < 0 ? 0 : busy, burn);
            inner += place(img ?? svgWrap("", false), x0 + c * PITCH, 40 + r * PITCH);
          }
        inner += label(x0, 28, t < 0 ? "at rest (nothing busy)" : `${tile} \u2014 t = ${t}ms`);
      });
      w = frames.length * (blockW + 34) - 34;
      h = 40 + rows * PITCH;
      log(`tile preview: ${tile} ${cols}x${rows}, busy=${busy}, burn=${fmtNum(burn)}/hr, log=${state.log.length} lines`);
    } else {
      await pollWeek();
      chartMetric = argOf("--metric") ?? "tokens";
      for (let col = 0; col < CHART_COLS; col++)
        for (let row = 0; row < CHART_ROWS; row++)
          inner += place(chartCell(col, row), col * PITCH, row * PITCH);
      const openY = CHART_ROWS * PITCH + 24;
      inner += place(chartOpenKey(state.week?.days ?? [], chartMetric), 0, openY);
      inner += label(KEY + 20, openY + 42, `launcher key (on the normal profile) \u2014 metric: ${chartMetric}`);
      w = CHART_COLS * PITCH - 8;
      h = openY + KEY;
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="#0b0a0e"/>${inner}</svg>`;
    const out = argOf("--out") ?? path.join(process.cwd(), "chart-preview.svg");
    fs.writeFileSync(out, svg);
    log(`preview written: ${out}`);
    process.exit(0);
  })();
} else {
  const port = argOf("-port");
  pluginUUID = argOf("-pluginUUID");
  const registerEvent = argOf("-registerEvent");
  log(`starting: port=${port} uuid=${pluginUUID}`);
  ws = new import_websocket.default(`ws://127.0.0.1:${port}`);
  ws.on("open", () => {
    send({ event: registerEvent, uuid: pluginUUID });
    log("registered with Stream Deck");
    pushLog("info", "boot", "claude-deck ok");
    pushLog("info", "tail", "~/.claude/sessions");
    pushLog("info", "watch", "burn-rate 60s");
    if (Date.now() - state.usageAt > 9e4) pollUsage();
    pollSessions();
    pollToday();
  });
  ws.on("close", () => {
    log("socket closed, exiting");
    process.exit(0);
  });
  ws.on("error", (e) => {
    log("socket error:", String(e));
  });
  ws.on("message", (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    const { event, context, action } = msg;
    if (event === "deviceDidConnect") {
      deviceTypes.set(msg.device, msg.deviceInfo?.type);
    } else if (event === "willAppear" && action) {
      const kind = kindOf(action);
      views.set(context, {
        kind,
        settings: msg.payload?.settings ?? {},
        coords: msg.payload?.coordinates ?? { column: 0, row: 0 },
        device: msg.device
      });
      setTitle(context);
      if ((kind === "chart-cell" || kind === "chart-open") && Date.now() - lastWeekPoll > 15e3) pollWeek();
      render(context, kind);
    } else if (event === "willDisappear") {
      views.delete(context);
      cycle.delete(context);
      focusIdx.delete(context);
    } else if (event === "didReceiveSettings" && action) {
      const v = views.get(context);
      if (v) {
        v.settings = msg.payload?.settings ?? {};
        render(context, v.kind);
      }
    } else if (event === "sendToPlugin" && action) {
      if (msg.payload?.cmd === "getModels") {
        send({ event: "sendToPropertyInspector", context, payload: { models: (state.usage?.models ?? []).map((m) => m.name) } });
      }
    } else if (event === "keyDown" && action) {
      onKeyDown(context, kindOf(action), msg.device ?? views.get(context)?.device);
    }
  });
  (function usageLoop() {
    setTimeout(async () => {
      await pollUsage();
      usageLoop();
    }, nextUsageDelay());
  })();
  setInterval(pollSessions, 5e3);
  setInterval(pollToday, 3e5);
  pollBurn();
  setInterval(pollBurn, 6e4);
  setInterval(() => {
    if ([...views.values()].some((v) => v.kind === "chart-cell" || v.kind === "chart-open")) pollWeek();
  }, 3e5);
  setInterval(() => {
    const busy = state.sessions.filter((s) => s.status && s.status !== "idle").length;
    const active = busy > 0 && !tilesPaused;
    const now = Date.now();
    for (const kind of TILE_KINDS) {
      if (![...views.values()].some((v) => v.kind === kind)) {
        tileRunning.delete(kind);
        continue;
      }
      const interval = active ? TILE_SPEC[kind].ms : TILE_SPEC[kind].idleMs;
      if (!interval) {
        if (tileRunning.has(kind)) {
          tileRunning.delete(kind);
          renderTiles(kind, false);
        }
        continue;
      }
      if (now - (tileLast.get(kind) ?? 0) < interval) continue;
      tileLast.set(kind, now);
      tileRunning.add(kind);
      renderTiles(kind, active);
    }
  }, 60);
  setInterval(() => {
    animPhase = (animPhase + 1) % 3;
    const kinds = [];
    if (state.sessions.some((s) => s.status && s.status !== "idle")) kinds.push("sessions");
    if (state.usage?.fiveHour?.pct >= 90) kinds.push("usage-session");
    if (state.usage?.weekly?.pct >= 90) kinds.push("usage-weekly");
    if ((state.usage?.models ?? []).some((m) => m.pct >= 90)) kinds.push("usage-model");
    if (kinds.length && [...views.values()].some((v) => kinds.includes(v.kind))) renderAll(kinds);
    const expired = [state.usage?.fiveHour, state.usage?.weekly].some((b) => b?.resetsAt && Date.now() - new Date(b.resetsAt).getTime() > 5e3);
    if (expired && !state.usageErr && Date.now() - lastUsageAttempt > 3e4) pollUsage();
  }, 600);
  setInterval(() => renderAll(["usage-session", "usage-weekly", "usage-model", "burn-rate"]), 3e4);
}
