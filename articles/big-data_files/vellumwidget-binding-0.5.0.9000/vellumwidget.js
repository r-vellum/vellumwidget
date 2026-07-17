// Generated from srcts/index.ts by esbuild — do not edit by hand.
"use strict";
(() => {
  // node_modules/flatqueue/index.js
  var FlatQueue = class {
    /**
     * Creates an empty queue. If `capacity` is provided, the queue is backed by fixed-size typed
     * arrays for better performance and memory use, but can't grow beyond `capacity`. `values` uses
     * `ValuesArray` (default `Float64Array`) and `ids` uses `IdsArray` (default `Uint32Array`); pass
     * narrower constructors like `Uint16Array` if your values or ids are known to fit them.
     *
     * @param {number} [capacity]
     * @param {TypedArrayConstructor} [ValuesArray]
     * @param {TypedArrayConstructor} [IdsArray]
     */
    constructor(capacity = Infinity, ValuesArray = Float64Array, IdsArray = Uint32Array) {
      const fixed = capacity !== Infinity;
      this.ids = fixed ? (
        /** @type {T[]} */
        /** @type {unknown} */
        new IdsArray(capacity)
      ) : [];
      this.values = fixed ? (
        /** @type {number[]} */
        /** @type {unknown} */
        new ValuesArray(capacity)
      ) : [];
      this.capacity = capacity;
      this.length = 0;
    }
    /** Removes all items from the queue. */
    clear() {
      this.length = 0;
    }
    /**
     * Adds `item` to the queue with the specified `priority`.
     *
     * `priority` must be a number. Items are sorted and returned from low to high priority. Multiple items
     * with the same priority value can be added to the queue, but there is no guaranteed order between these items.
     *
     * For fixed-capacity queues, throws a `RangeError` if the queue is already full.
     *
     * @param {T} item
     * @param {number} priority
     */
    push(item, priority) {
      if (this.length === this.capacity) throw new RangeError("Queue is at capacity.");
      let pos = this.length++;
      while (pos > 0) {
        const parent = pos - 1 >> 1;
        const parentValue = this.values[parent];
        if (priority >= parentValue) break;
        this.ids[pos] = this.ids[parent];
        this.values[pos] = parentValue;
        pos = parent;
      }
      this.ids[pos] = item;
      this.values[pos] = priority;
    }
    /**
     * Removes and returns the item from the head of this queue, which is one of
     * the items with the lowest priority. If this queue is empty, returns `undefined`.
     */
    pop() {
      if (this.length === 0) return void 0;
      const ids = this.ids, values = this.values, top = ids[0], last = --this.length;
      if (last > 0) {
        const id = ids[last];
        const value = values[last];
        let pos = 0;
        const halfLen = last >> 1;
        while (pos < halfLen) {
          const left = (pos << 1) + 1;
          const right = left + 1;
          const child = left + (+(right < last) & +(values[right] < values[left]));
          if (values[child] >= value) break;
          ids[pos] = ids[child];
          values[pos] = values[child];
          pos = child;
        }
        ids[pos] = id;
        values[pos] = value;
      }
      return top;
    }
    /** Returns the item from the head of this queue without removing it. If this queue is empty, returns `undefined`. */
    peek() {
      return this.length > 0 ? this.ids[0] : void 0;
    }
    /**
     * Returns the priority value of the item at the head of this queue without
     * removing it. If this queue is empty, returns `undefined`.
     */
    peekValue() {
      return this.length > 0 ? this.values[0] : void 0;
    }
    /**
     * Shrinks the internal arrays to `this.length`. No-op for queues with fixed capacity.
     *
     * `pop()` and `clear()` calls don't free memory automatically to avoid unnecessary resize operations.
     * This also means that items that have been added to the queue can't be garbage collected until
     * a new item is pushed in their place, or this method is called.
     */
    shrink() {
      if (Array.isArray(this.ids)) this.ids.length = this.length;
      if (Array.isArray(this.values)) this.values.length = this.length;
    }
  };

  // node_modules/flatbush/index.js
  var ARRAY_TYPES = [Int8Array, Uint8Array, Uint8ClampedArray, Int16Array, Uint16Array, Int32Array, Uint32Array, Float32Array, Float64Array];
  var VERSION = 3;
  var Flatbush = class _Flatbush {
    /**
     * Recreate a Flatbush index from raw `ArrayBuffer` or `SharedArrayBuffer` data.
     * @param {ArrayBufferLike} data
     * @param {number} [byteOffset=0] byte offset to the start of the Flatbush buffer in the referenced ArrayBuffer.
     * @returns {Flatbush} index
     */
    static from(data, byteOffset = 0) {
      if (byteOffset % 8 !== 0) {
        throw new Error("byteOffset must be 8-byte aligned.");
      }
      if (!data || data.byteLength === void 0 || "buffer" in data) {
        throw new Error("Data must be an instance of ArrayBuffer or SharedArrayBuffer.");
      }
      const [magic, versionAndType] = new Uint8Array(data, byteOffset + 0, 2);
      if (magic !== 251) {
        throw new Error("Data does not appear to be in a Flatbush format.");
      }
      const version = versionAndType >> 4;
      if (version !== VERSION) {
        throw new Error(`Got v${version} data when expected v${VERSION}.`);
      }
      const ArrayType = ARRAY_TYPES[versionAndType & 15];
      if (!ArrayType) {
        throw new Error("Unrecognized array type.");
      }
      const [nodeSize] = new Uint16Array(data, byteOffset + 2, 1);
      const [numItems] = new Uint32Array(data, byteOffset + 4, 1);
      return new _Flatbush(numItems, nodeSize, ArrayType, void 0, data, byteOffset);
    }
    /**
     * Create a Flatbush index that will hold a given number of items.
     * @param {number} numItems
     * @param {number} [nodeSize=16] Size of the tree node (16 by default).
     * @param {TypedArrayConstructor} [ArrayType=Float64Array] The array type used for coordinates storage (`Float64Array` by default).
     * @param {ArrayBufferConstructor | SharedArrayBufferConstructor} [ArrayBufferType=ArrayBuffer] The array buffer type used to store data (`ArrayBuffer` by default).
     * @param {ArrayBufferLike} [data] (Only used internally)
     * @param {number} [byteOffset=0] (Only used internally)
     */
    constructor(numItems, nodeSize = 16, ArrayType = Float64Array, ArrayBufferType = ArrayBuffer, data, byteOffset = 0) {
      if (numItems === void 0) throw new Error("Missing required argument: numItems.");
      if (isNaN(numItems) || numItems <= 0) throw new Error(`Unexpected numItems value: ${numItems}.`);
      this.numItems = +numItems;
      this.nodeSize = Math.min(Math.max(+nodeSize, 2), 65535);
      this.byteOffset = byteOffset;
      let n = numItems;
      let numNodes = n;
      this._levelBounds = [n * 4];
      do {
        n = Math.ceil(n / this.nodeSize);
        numNodes += n;
        this._levelBounds.push(numNodes * 4);
      } while (n !== 1);
      this.ArrayType = ArrayType;
      this.IndexArrayType = numNodes < 16384 ? Uint16Array : Uint32Array;
      const arrayTypeIndex = ARRAY_TYPES.indexOf(ArrayType);
      const nodesByteSize = numNodes * 4 * ArrayType.BYTES_PER_ELEMENT;
      if (arrayTypeIndex < 0) {
        throw new Error(`Unexpected typed array class: ${ArrayType}.`);
      }
      const BoxCtor = ArrayType;
      const IdxCtor = this.IndexArrayType;
      if (data) {
        this.data = data;
        this._boxes = new BoxCtor(data, byteOffset + 8, numNodes * 4);
        this._indices = new IdxCtor(data, byteOffset + 8 + nodesByteSize, numNodes);
        this._pos = numNodes * 4;
        this.minX = this._boxes[this._pos - 4];
        this.minY = this._boxes[this._pos - 3];
        this.maxX = this._boxes[this._pos - 2];
        this.maxY = this._boxes[this._pos - 1];
      } else {
        const data2 = this.data = new ArrayBufferType(8 + nodesByteSize + numNodes * this.IndexArrayType.BYTES_PER_ELEMENT);
        this._boxes = new BoxCtor(data2, 8, numNodes * 4);
        this._indices = new IdxCtor(data2, 8 + nodesByteSize, numNodes);
        this._pos = 0;
        this.minX = Infinity;
        this.minY = Infinity;
        this.maxX = -Infinity;
        this.maxY = -Infinity;
        new Uint8Array(data2, 0, 2).set([251, (VERSION << 4) + arrayTypeIndex]);
        new Uint16Array(data2, 2, 1)[0] = nodeSize;
        new Uint32Array(data2, 4, 1)[0] = numItems;
      }
      this._queue = new FlatQueue();
    }
    /**
     * Add a given rectangle to the index.
     * @param {number} minX
     * @param {number} minY
     * @param {number} maxX
     * @param {number} maxY
     * @returns {number} A zero-based, incremental number that represents the newly added rectangle.
     */
    add(minX, minY, maxX = minX, maxY = minY) {
      const pos = this._pos;
      const index = pos >> 2;
      const boxes = this._boxes;
      this._indices[index] = index;
      boxes[pos] = minX;
      boxes[pos + 1] = minY;
      boxes[pos + 2] = maxX;
      boxes[pos + 3] = maxY;
      this._pos = pos + 4;
      if (minX < this.minX) this.minX = minX;
      if (minY < this.minY) this.minY = minY;
      if (maxX > this.maxX) this.maxX = maxX;
      if (maxY > this.maxY) this.maxY = maxY;
      return index;
    }
    /** Perform indexing of the added rectangles. */
    finish() {
      if (this._pos >> 2 !== this.numItems) {
        throw new Error(`Added ${this._pos >> 2} items when expected ${this.numItems}.`);
      }
      const boxes = this._boxes;
      if (this.numItems <= this.nodeSize) {
        boxes[this._pos++] = this.minX;
        boxes[this._pos++] = this.minY;
        boxes[this._pos++] = this.maxX;
        boxes[this._pos++] = this.maxY;
        return;
      }
      const { numItems, minX, minY, nodeSize, _indices: indices, _levelBounds: levelBounds } = this;
      const width = this.maxX - minX || 1;
      const height = this.maxY - minY || 1;
      const hilbertValues = new Int32Array(numItems);
      const hilbertMax = (1 << 16) - 1;
      const sx = hilbertMax / width;
      const sy = hilbertMax / height;
      for (let i = 0, pos2 = 0; i < numItems; i++) {
        const itemMinX = boxes[pos2++];
        const itemMinY = boxes[pos2++];
        const itemMaxX = boxes[pos2++];
        const itemMaxY = boxes[pos2++];
        const x = sx * ((itemMinX + itemMaxX) / 2 - minX) | 0;
        const y = sy * ((itemMinY + itemMaxY) / 2 - minY) | 0;
        hilbertValues[i] = hilbert(x, y);
      }
      sort(hilbertValues, boxes, indices, 0, numItems - 1, nodeSize);
      let pos = numItems * 4;
      for (let i = 0, readPos = 0; i < levelBounds.length - 1; i++) {
        const end = levelBounds[i];
        while (readPos < end) {
          const nodeIndex = readPos;
          let nodeMinX = boxes[readPos++];
          let nodeMinY = boxes[readPos++];
          let nodeMaxX = boxes[readPos++];
          let nodeMaxY = boxes[readPos++];
          for (let j = 1; j < nodeSize && readPos < end; j++) {
            nodeMinX = Math.min(nodeMinX, boxes[readPos++]);
            nodeMinY = Math.min(nodeMinY, boxes[readPos++]);
            nodeMaxX = Math.max(nodeMaxX, boxes[readPos++]);
            nodeMaxY = Math.max(nodeMaxY, boxes[readPos++]);
          }
          indices[pos >> 2] = nodeIndex;
          boxes[pos++] = nodeMinX;
          boxes[pos++] = nodeMinY;
          boxes[pos++] = nodeMaxX;
          boxes[pos++] = nodeMaxY;
        }
      }
      this._pos = pos;
    }
    /**
     * Search the index by a bounding box.
     * @param {number} minX
     * @param {number} minY
     * @param {number} maxX
     * @param {number} maxY
     * @param {(index: number, x0: number, y0: number, x1: number, y1: number) => boolean} [filterFn] An optional function that is called on every found item; if supplied, only items for which this function returns true will be included in the results array.
     * @returns {number[]} An array of indices of items intersecting or touching the given bounding box.
     */
    search(minX, minY, maxX, maxY, filterFn) {
      if (this._pos !== this._boxes.length) {
        throw new Error("Data not yet indexed - call index.finish().");
      }
      const { _boxes: boxes, _levelBounds: levelBounds, _indices: indices, nodeSize } = this;
      const numItems4 = this.numItems * 4;
      let nodeIndex = boxes.length - 4;
      let level = levelBounds.length - 1;
      const q = [];
      const results = [];
      let contained = false;
      while (nodeIndex !== void 0) {
        const end = Math.min(nodeIndex + nodeSize * 4, levelBounds[level]);
        const isNode = nodeIndex >= numItems4;
        if (contained) {
          this._collectContained(nodeIndex, end, level, numItems4, results, filterFn);
        } else {
          for (let pos = nodeIndex; pos < end; pos += 4) {
            const x0 = boxes[pos];
            if (maxX < x0) continue;
            const y0 = boxes[pos + 1];
            if (maxY < y0) continue;
            const x1 = boxes[pos + 2];
            if (minX > x1) continue;
            const y1 = boxes[pos + 3];
            if (minY > y1) continue;
            const index = indices[pos >> 2] | 0;
            if (isNode) {
              const c = +(minX <= x0 && minY <= y0 && maxX >= x1 && maxY >= y1);
              q.push(index | c, level - 1);
            } else if (filterFn === void 0 || filterFn(index, x0, y0, x1, y1)) {
              results.push(index);
            }
          }
        }
        level = /** @type {number} */
        q.pop();
        nodeIndex = q.pop();
        if (nodeIndex !== void 0) {
          contained = (nodeIndex & 1) === 1;
          nodeIndex &= ~1;
        }
      }
      return results;
    }
    /**
     * Collect all leaves of a subtree that's fully inside the query, skipping intersection tests.
     * Because the tree is packed bottom-up, those leaves occupy one contiguous block of the leaf
     * level, so we skip traversal entirely: descend to the first leaf, then sweep the flat range.
     * @param {number} nodeIndex
     * @param {number} end
     * @param {number} level
     * @param {number} numItems4
     * @param {number[]} results
     * @param {((index: number, x0: number, y0: number, x1: number, y1: number) => boolean) | undefined} filterFn
     */
    _collectContained(nodeIndex, end, level, numItems4, results, filterFn) {
      const boxes = this._boxes;
      const indices = this._indices;
      let pos = nodeIndex;
      for (let l = level; l > 0; l--) pos = indices[pos >> 2];
      const leafEnd = Math.min(pos + (end - nodeIndex) * this.nodeSize ** level, numItems4);
      if (filterFn === void 0) {
        for (; pos < leafEnd; pos += 4) results.push(indices[pos >> 2] | 0);
      } else {
        for (; pos < leafEnd; pos += 4) {
          const index = indices[pos >> 2] | 0;
          if (filterFn(index, boxes[pos], boxes[pos + 1], boxes[pos + 2], boxes[pos + 3])) results.push(index);
        }
      }
    }
    /**
     * Search items in order of distance from the given point.
     * @param {number} x
     * @param {number} y
     * @param {number} [maxResults=Infinity]
     * @param {number} [maxDistance=Infinity]
     * @param {(index: number) => boolean} [filterFn] An optional function for filtering the results.
     * @returns {number[]} An array of indices of items found.
     */
    neighbors(x, y, maxResults = Infinity, maxDistance = Infinity, filterFn) {
      if (this._pos !== this._boxes.length) {
        throw new Error("Data not yet indexed - call index.finish().");
      }
      const { _boxes: boxes, _levelBounds: levelBounds, _indices: indices, _queue: q, nodeSize } = this;
      const numItems4 = this.numItems * 4;
      const nodeSize4 = nodeSize * 4;
      const results = [];
      const maxDistSquared = maxDistance * maxDistance;
      const trackNearest = maxResults === 1;
      let bound = maxDistSquared;
      q.push(boxes.length - 4 << 1, 0);
      while (q.length) {
        const top = q.ids[0];
        if (top & 1) {
          q.pop();
          results.push(top >> 1);
          if (results.length === maxResults) break;
          continue;
        }
        q.pop();
        const nodeIndex = top >> 1;
        const isLeafLevel = nodeIndex < numItems4;
        const end = Math.min(nodeIndex + nodeSize4, upperBound(nodeIndex, levelBounds));
        for (let pos = nodeIndex; pos < end; pos += 4) {
          const minX = boxes[pos];
          const minY = boxes[pos + 1];
          const maxX = boxes[pos + 2];
          const maxY = boxes[pos + 3];
          const dx = Math.max(Math.max(minX - x, x - maxX), 0);
          const dy = Math.max(Math.max(minY - y, y - maxY), 0);
          const dist = dx * dx + dy * dy;
          if (dist > bound) continue;
          const childIndex = indices[pos >> 2] | 0;
          if (isLeafLevel) {
            if (filterFn === void 0 || filterFn(childIndex)) {
              q.push(childIndex << 1 | 1, dist);
              if (trackNearest && dist < bound) bound = dist;
            }
          } else {
            q.push(childIndex << 1, dist);
          }
        }
      }
      q.clear();
      return results;
    }
  };
  function upperBound(value, arr) {
    let i = 0;
    let j = arr.length - 1;
    while (i < j) {
      const m = i + j >> 1;
      if (arr[m] > value) {
        j = m;
      } else {
        i = m + 1;
      }
    }
    return arr[i];
  }
  function sort(values, boxes, indices, left, right, nodeSize) {
    const stack = [left, right];
    while (stack.length) {
      const r = stack.pop() || 0;
      const l = stack.pop() || 0;
      if (r - l <= nodeSize && Math.floor(l / nodeSize) >= Math.floor(r / nodeSize)) continue;
      const a = values[l];
      const b = values[l + r >> 1];
      const c = values[r];
      const pivot = a > b !== a > c ? a : b < a !== b < c ? b : c;
      let i = l - 1;
      let j = r + 1;
      while (true) {
        do
          i++;
        while (values[i] < pivot);
        do
          j--;
        while (values[j] > pivot);
        if (i >= j) break;
        swap(values, boxes, indices, i, j);
      }
      stack.push(l, j, j + 1, r);
    }
  }
  function swap(values, boxes, indices, i, j) {
    const temp = values[i];
    values[i] = values[j];
    values[j] = temp;
    const k = 4 * i;
    const m = 4 * j;
    const a = boxes[k];
    const b = boxes[k + 1];
    const c = boxes[k + 2];
    const d = boxes[k + 3];
    boxes[k] = boxes[m];
    boxes[k + 1] = boxes[m + 1];
    boxes[k + 2] = boxes[m + 2];
    boxes[k + 3] = boxes[m + 3];
    boxes[m] = a;
    boxes[m + 1] = b;
    boxes[m + 2] = c;
    boxes[m + 3] = d;
    const e = indices[i];
    indices[i] = indices[j];
    indices[j] = e;
  }
  function hilbert(x, y) {
    let a = x ^ y;
    let b = 65535 ^ a;
    let c = 65535 ^ (x | y);
    let d = x & (y ^ 65535);
    let A = a | b >> 1;
    let B = a >> 1 ^ a;
    let C = c ^ (c >> 1 ^ b & d >> 1);
    let D = d ^ (a & c >> 1 ^ d >> 1);
    a = A & A >> 2 ^ B & B >> 2;
    b = A & B >> 2 ^ B & (A ^ B) >> 2;
    c = C ^ (A & C >> 2 ^ B & D >> 2);
    d = D ^ (B & C >> 2 ^ (A ^ B) & D >> 2);
    A = a & a >> 4 ^ b & b >> 4;
    B = a & b >> 4 ^ b & (a ^ b) >> 4;
    C = c ^ (a & c >> 4 ^ b & d >> 4);
    D = d ^ (b & c >> 4 ^ (a ^ b) & d >> 4);
    c = C ^ (A & C >> 8 ^ B & D >> 8);
    d = D ^ (B & C >> 8 ^ (A ^ B) & D >> 8);
    c ^= c >> 1;
    d ^= d >> 1;
    a = x ^ y;
    b = d | 65535 ^ (a | c);
    a = (a | a << 8) & 16711935;
    a = (a | a << 4) & 252645135;
    a = (a | a << 2) & 858993459;
    a = (a | a << 1) & 1431655765;
    b = (b | b << 8) & 16711935;
    b = (b | b << 4) & 252645135;
    b = (b | b << 2) & 858993459;
    b = (b | b << 1) & 1431655765;
    return ((b << 1 | a) >>> 0) - 2147483648;
  }

  // srcts/index.ts
  function rectsIntersect(a, b) {
    return a.x0 <= b.x1 && a.x1 >= b.x0 && a.y0 <= b.y1 && a.y1 >= b.y0;
  }
  function distToBbox(x, y, b) {
    const dx = Math.max(b.x0 - x, 0, x - b.x1);
    const dy = Math.max(b.y0 - y, 0, y - b.y1);
    return Math.sqrt(dx * dx + dy * dy);
  }
  function hasBbox(e) {
    return typeof e.x0 === "number" && typeof e.y0 === "number";
  }
  function asColumn(v) {
    if (v == null) return [];
    return Array.isArray(v) ? v : [v];
  }
  function normalizeElements(raw) {
    if (raw == null) return [];
    if (Array.isArray(raw)) return raw;
    const c = raw;
    const key = asColumn(c.key);
    const n = key.length;
    if (!n) return [];
    const x0 = asColumn(c.x0);
    const y0 = asColumn(c.y0);
    const x1 = asColumn(c.x1);
    const y1 = asColumn(c.y1);
    const tooltip = c.tooltip != null ? asColumn(c.tooltip) : null;
    const hoverGroup = c.hover_group != null ? asColumn(c.hover_group) : null;
    const hoverColor = c.hover_color != null ? asColumn(c.hover_color) : null;
    const selectedColor = c.selected_color != null ? asColumn(c.selected_color) : null;
    const legendFor = c.legend_for != null ? asColumn(c.legend_for) : null;
    const legend = c.legend != null ? asColumn(c.legend) : null;
    const out = new Array(n);
    for (let i = 0; i < n; i++) {
      const e = { key: String(key[i]) };
      if (typeof x0[i] === "number") e.x0 = x0[i];
      if (typeof y0[i] === "number") e.y0 = y0[i];
      if (typeof x1[i] === "number") e.x1 = x1[i];
      if (typeof y1[i] === "number") e.y1 = y1[i];
      if (tooltip && tooltip[i] != null) e.tooltip = String(tooltip[i]);
      if (hoverGroup && hoverGroup[i] != null) e.hover_group = String(hoverGroup[i]);
      if (hoverColor && hoverColor[i] != null) e.hover_color = String(hoverColor[i]);
      if (selectedColor && selectedColor[i] != null) e.selected_color = String(selectedColor[i]);
      if (legendFor && legendFor[i] != null) e.legend_for = String(legendFor[i]);
      if (legend) {
        const v = legend[i];
        if (v != null && !(Array.isArray(v) && v.length === 0)) e.legend = v;
      }
      out[i] = e;
    }
    return out;
  }
  function brushKeys(elems, brush) {
    const out = [];
    const seen = {};
    for (let i = 0; i < elems.length; i++) {
      const e = elems[i];
      if (hasBbox(e) && rectsIntersect(e, brush) && !seen[e.key]) {
        seen[e.key] = true;
        out.push(e.key);
      }
    }
    return out;
  }
  function nearestKey(elems, x, y, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (let i = 0; i < elems.length; i++) {
      const e = elems[i];
      if (!hasBbox(e)) continue;
      const d = distToBbox(x, y, e);
      if (d <= bestD) {
        bestD = d;
        best = e.key;
      }
    }
    return best;
  }
  function nearestSortedIdx(sorted, target) {
    const n = sorted.length;
    if (!n) return -1;
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const mid = lo + hi >> 1;
      if (sorted[mid] < target) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0 && Math.abs(sorted[lo - 1] - target) <= Math.abs(sorted[lo] - target)) return lo - 1;
    return lo;
  }
  function columnTolerance(sorted) {
    let minGap = Infinity;
    for (let i = 1; i < sorted.length; i++) {
      const g = sorted[i] - sorted[i - 1];
      if (g > 1e-6 && g < minGap) minGap = g;
    }
    return isFinite(minGap) ? minGap / 2 : 1;
  }
  function zoomViewBox(vb, factor, cx, cy) {
    const w = vb.w / factor;
    const h = vb.h / factor;
    return { x: cx - (cx - vb.x) / factor, y: cy - (cy - vb.y) / factor, w, h };
  }
  function parseViewBox(s) {
    if (!s) return null;
    const p = s.trim().split(/[ ,]+/).map(Number);
    if (p.length !== 4 || p.some((n) => !isFinite(n))) return null;
    return { x: p[0], y: p[1], w: p[2], h: p[3] };
  }
  function fmtViewBox(vb) {
    return vb.x + " " + vb.y + " " + vb.w + " " + vb.h;
  }
  function isZoomedIn(vb, vb0) {
    return vb.w < vb0.w * 0.999 || vb.h < vb0.h * 0.999;
  }
  function userToCanvas(vb, cw, ch, x, y) {
    return { px: (x - vb.x) / vb.w * cw, py: (y - vb.y) / vb.h * ch };
  }
  function unionBbox(elems, keys) {
    let out = null;
    for (let i = 0; i < elems.length; i++) {
      const e = elems[i];
      if (!hasBbox(e) || !keys[e.key]) continue;
      if (!out) out = { x0: e.x0, y0: e.y0, x1: e.x1, y1: e.y1 };
      else {
        out.x0 = Math.min(out.x0, e.x0);
        out.y0 = Math.min(out.y0, e.y0);
        out.x1 = Math.max(out.x1, e.x1);
        out.y1 = Math.max(out.y1, e.y1);
      }
    }
    return out;
  }
  var STYLE_ID = "vellumwidget-style";
  var VELLUMWIDGET_CSS = `
.vellumwidget-root { position: relative; display: inline-block; max-width: 100%; }
/* The stage shrink-wraps the base svg in BOTH dimensions (inline-block sizes to
   content), so its box equals the svg's rendered box. The absolute overlays below
   fill THIS box, not the root's \u2014 the root can be taller AND wider than the svg
   (htmlwidgets stamps an explicit height; a fluid layout can stretch the width),
   and sizing the overlays to the root would letterbox their viewBox and shift
   every ring (down if the root is taller, sideways if it is wider). */
.vellumwidget-root .vellumwidget-stage { position: relative; display: inline-block; }
.vellumwidget-root .vellumwidget-svg-holder svg { max-width: 100%; height: auto; display: block; }
.vellumwidget-gesture .vellumwidget-svg-holder svg { touch-action: none; }
.vellumwidget-root.vellumwidget-mode-pan .vellumwidget-svg-holder svg { cursor: grab; }
.vellumwidget-root.vellumwidget-panning .vellumwidget-svg-holder svg { cursor: grabbing; }
.vellumwidget-root [data-key] { cursor: pointer; }
[data-key].vellumwidget-filtered { display: none; }
/* Legend click-to-hide / -mute (independent of the crosstalk cross-filter above,
   so the two never clobber each other). hidden removes the series' marks; muted
   keeps them but fades them right back; legend-off dims the toggled-off swatch
   so the legend shows which series are on. */
[data-key].vellumwidget-legend-hidden { display: none; }
[data-key].vellumwidget-legend-muted { opacity: 0.12; }
[data-key].vellumwidget-legend.vellumwidget-legend-off { opacity: 0.4; }
.vellumwidget-hovering [data-key]:not(.vellumwidget-legend) { opacity: var(--vellumwidget-dim-opacity, 0.28); }
.vellumwidget-hovering [data-key].vellumwidget-hl { opacity: 1; }
/* Large-scene hover: instead of the CSS rule above restyling every keyed node
   (O(n) per hover), the whole plot is dimmed once via the holder's opacity and the
   hovered marks are re-drawn crisp in this overlay (O(hovered)). See setHover(). */
.vellumwidget-root .vellumwidget-svg-holder { transition: none; }
/* Crisp-zoom point layer: above the base image, below the overlay rings. Never
   intercepts hit-testing (that stays on the base svg). Hidden until zoomed in. */
.vellumwidget-canvas {
  position: absolute; inset: 0; width: 100%; height: 100%;
  pointer-events: none; z-index: 2; display: none;
}
.vellumwidget-dim-layer {
  position: absolute; inset: 0; width: 100%; height: 100%;
  pointer-events: none; z-index: 5; overflow: visible;
}
/* Crosshair guide rule(s) for unified hover \u2014 above the base image / canvas,
   below the highlight rings so a highlighted mark still reads on top. */
.vellumwidget-crosshair-layer {
  position: absolute; inset: 0; width: 100%; height: 100%;
  pointer-events: none; z-index: 4; overflow: visible;
}
.vellumwidget-crosshair-line {
  stroke: var(--vellumwidget-crosshair-stroke, rgba(75,85,99,0.85));
  stroke-width: 1px; stroke-dasharray: 4 3;
}
@media (prefers-color-scheme: dark) {
  .vellumwidget-crosshair-line { stroke: var(--vellumwidget-crosshair-stroke, rgba(209,213,219,0.85)); }
}
/* Raster-mode feedback rings (hover / selection), drawn on the overlay since the
   marks are a base image with no per-element nodes. Colours reuse the same CSS
   variables as the SVG-mode highlight/selection so theming carries over. */
.vellumwidget-fb-hov { fill: none; stroke: var(--vellumwidget-hl-stroke, #2563eb); stroke-width: 2px; }
.vellumwidget-fb-sel { fill: none; stroke: var(--vellumwidget-selected-stroke, #111827); stroke-width: 1.6px; }
@media (prefers-color-scheme: dark) {
  .vellumwidget-fb-sel { stroke: var(--vellumwidget-selected-stroke, #f9fafb); }
}
/* Optional hover stroke, opt-in per element (.vellumwidget-hc) or widget-wide
   (.vellumwidget-hc-all on the root). Never applied to a mark that has no hover colour,
   so a bordered shape is not clobbered on hover. Colour resolves from the nearest
   --vellumwidget-hl-stroke (element var overrides the root var). */
.vellumwidget-hc-all [data-key].vellumwidget-hl, [data-key].vellumwidget-hc.vellumwidget-hl {
  stroke: var(--vellumwidget-hl-stroke); stroke-width: var(--vellumwidget-hl-width, 2px); paint-order: stroke fill;
}
[data-key].vellumwidget-selected {
  stroke: var(--vellumwidget-selected-stroke, #111827);
  stroke-width: var(--vellumwidget-selected-width, 1.4px); paint-order: stroke fill;
}
/* Keyboard focus ring on the currently-traversed mark (a11y). */
[data-key].vellumwidget-focus {
  stroke: var(--vellumwidget-focus-stroke, #2563eb);
  stroke-width: var(--vellumwidget-focus-width, 2.5px); paint-order: stroke fill;
}
[data-key]:focus { outline: none; }
[data-key]:focus-visible { outline: 2px solid var(--vellumwidget-focus-stroke, #2563eb); outline-offset: 1px; }
/* Visually-hidden but exposed to assistive technology (live region + data table). */
.vellumwidget-sr-only {
  position: absolute !important; width: 1px; height: 1px;
  padding: 0; margin: -1px; overflow: hidden; border: 0;
  clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap;
}
.vellumwidget-tip {
  position: absolute; left: 0; top: 0; pointer-events: none; z-index: 20;
  background: var(--vellumwidget-tip-bg, rgba(17,24,39,0.94)); color: var(--vellumwidget-tip-fg, #fff);
  font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  font-size: var(--vellumwidget-tip-fontsize, 12px); line-height: 1.45;
  padding: 5px 8px; border-radius: 5px; white-space: pre-wrap;
  max-width: var(--vellumwidget-tip-maxwidth, 320px);
  box-shadow: 0 2px 8px rgba(0,0,0,0.25);
  opacity: 0; transition: opacity 0.08s ease; will-change: transform;
}
.vellumwidget-tip.vellumwidget-show { opacity: 1; }
.vellumwidget-brush {
  position: absolute; pointer-events: none; z-index: 15;
  border: 1px solid #2563eb; background: rgba(37,99,235,0.12); display: none;
}
.vellumwidget-toolbar {
  position: absolute; top: 6px; right: 6px; z-index: 25; display: flex; gap: 2px;
  padding: 3px; border-radius: 6px; background: rgba(255,255,255,0.82);
  box-shadow: 0 1px 4px rgba(0,0,0,0.18); opacity: 0; transition: opacity 0.12s;
}
.vellumwidget-root:hover .vellumwidget-toolbar { opacity: 1; }
.vellumwidget-toolbar button {
  border: 0; background: transparent; cursor: pointer; border-radius: 4px;
  font: 13px/1 system-ui, sans-serif; padding: 4px 6px; color: #111827;
}
.vellumwidget-toolbar button:hover { background: rgba(0,0,0,0.08); }
.vellumwidget-toolbar button.vellumwidget-active { background: rgba(37,99,235,0.18); }
@media (prefers-color-scheme: dark) {
  .vellumwidget-tip { background: var(--vellumwidget-tip-bg, rgba(243,244,246,0.96)); color: var(--vellumwidget-tip-fg, #111827); }
  [data-key].vellumwidget-selected { stroke: var(--vellumwidget-selected-stroke, #f9fafb); }
  .vellumwidget-toolbar { background: rgba(31,41,55,0.9); }
  .vellumwidget-toolbar button { color: #f3f4f6; }
  .vellumwidget-toolbar button:hover { background: rgba(255,255,255,0.12); }
}
`;
  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent = VELLUMWIDGET_CSS;
    document.head.appendChild(s);
  }
  function cssEscape(value) {
    const anyCss = window.CSS;
    if (anyCss && typeof anyCss.escape === "function") return anyCss.escape(value);
    return value.replace(/["\\\]\[#.:;,()>~+*^$|=@!%&{}\/\s]/g, "\\$&");
  }
  var TIP_TAGS = ["b", "i", "em", "strong", "br", "span"];
  function sanitizeTip(s) {
    let out = String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    for (const t of TIP_TAGS) {
      out = out.replace(new RegExp("&lt;" + t + "&gt;", "gi"), "<" + t + ">").replace(new RegExp("&lt;/" + t + "&gt;", "gi"), "</" + t + ">").replace(new RegExp("&lt;" + t + "\\s*/&gt;", "gi"), "<" + t + ">");
    }
    return out;
  }
  function stripTags(s) {
    return String(s).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  }
  function keyOf(target) {
    const el = target;
    if (!el || typeof el.closest !== "function") return null;
    const hit = el.closest("[data-key]");
    return hit ? hit.getAttribute("data-key") : null;
  }
  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  var DRAG_THRESHOLD = 3;
  var vellumwidgetBus = {};
  function busJoin(group, m) {
    (vellumwidgetBus[group] = vellumwidgetBus[group] || []).push(m);
  }
  function busPublish(group, sender, keys) {
    const members = vellumwidgetBus[group] || [];
    for (let i = 0; i < members.length; i++) {
      if (members[i].token !== sender) members[i].onSelect(keys);
    }
  }
  function getCrosstalk() {
    return window.crosstalk || null;
  }
  HTMLWidgets.widget({
    name: "vellumwidget",
    type: "output",
    factory: function(el) {
      ensureStyle();
      el.classList.add("vellumwidget-root");
      const tip = document.createElement("div");
      tip.className = "vellumwidget-tip";
      const brushBox = document.createElement("div");
      brushBox.className = "vellumwidget-brush";
      let holder = null;
      let stage = null;
      let svgEl = null;
      let toolbarEl = null;
      let meta = {};
      let groups = {};
      let legendIndex = {};
      let legendSwatch = {};
      let legendOff = {};
      let hiddenKeySet = {};
      let elements = [];
      let selected = {};
      let nodesByKey = {};
      let hoverRAF = 0;
      let spatialIndex = null;
      let indexToElem = [];
      const DIM_OVERLAY_MIN = 2e3;
      let largeDim = false;
      let dimLayer = null;
      let crosshairLayer = null;
      let sortedCx = [];
      let sortedCxKeys = [];
      let sortedCy = [];
      let sortedCyKeys = [];
      let tolX = 1;
      let tolY = 1;
      let rasterMode = false;
      let selGroup = null;
      let hovGroup = null;
      let canvasEl = null;
      let ctx = null;
      let ptCx = null;
      let ptCy = null;
      let ptRad = null;
      let ptRGB = null;
      let ptN = 0;
      const OVERLAY_MARK_CAP = 2e3;
      let opts = {
        tooltip: true,
        hover: true,
        select: true,
        brush: true,
        zoom: true,
        toolbar: true,
        nearest: true,
        a11y: true,
        selectMode: "multiple",
        hoverMode: "closest",
        crosshair: false
      };
      let liveRegion = null;
      let tableEl = null;
      let focusables = [];
      let focusIdx = -1;
      let vb0 = null;
      let vb = null;
      let mode = "brush";
      let lastBrush = null;
      const selfToken = {};
      let group = null;
      let joined = false;
      let ctSel = null;
      let ctFilt = null;
      function toUser(clientX, clientY) {
        if (svgEl && typeof svgEl.getScreenCTM === "function") {
          const ctm = svgEl.getScreenCTM();
          if (ctm && typeof svgEl.createSVGPoint === "function") {
            const p = svgEl.createSVGPoint();
            p.x = clientX;
            p.y = clientY;
            const u = p.matrixTransform(ctm.inverse());
            return { x: u.x, y: u.y };
          }
        }
        const r = (svgEl || el).getBoundingClientRect();
        const view = vb || { x: 0, y: 0, w: r.width || 1, h: r.height || 1 };
        const fx = r.width ? (clientX - r.left) / r.width : 0;
        const fy = r.height ? (clientY - r.top) / r.height : 0;
        return { x: view.x + fx * view.w, y: view.y + fy * view.h };
      }
      function elementsForKey(k) {
        const cached = nodesByKey[k];
        if (cached) return cached;
        if (!holder) return [];
        return Array.prototype.slice.call(holder.querySelectorAll('[data-key="' + cssEscape(k) + '"]'));
      }
      function addClassForKeys(keys, cls) {
        for (let i = 0; i < keys.length; i++) {
          const nodes = elementsForKey(keys[i]);
          for (let j = 0; j < nodes.length; j++) nodes[j].classList.add(cls);
        }
      }
      function clearClass(cls) {
        if (!holder) return;
        const nodes = holder.querySelectorAll("." + cls);
        for (let i = 0; i < nodes.length; i++) nodes[i].classList.remove(cls);
      }
      function linkedKeys(k) {
        const m = meta[k];
        if (m && m.legend_for != null) return (legendIndex[m.legend_for] || []).concat([k]);
        const g = m && m.hover_group;
        return g && groups[g] ? groups[g] : [k];
      }
      function legendPolicy() {
        return opts.legendClick || "select";
      }
      function swatchSeries(k) {
        if (k == null) return null;
        const m = meta[k];
        return m && m.legend_for != null ? m.legend_for : null;
      }
      function applyLegend() {
        clearClass("vellumwidget-legend-hidden");
        clearClass("vellumwidget-legend-muted");
        clearClass("vellumwidget-legend-off");
        hiddenKeySet = {};
        const pol = legendPolicy();
        if (pol === "select") return;
        const cls = pol === "mute" ? "vellumwidget-legend-muted" : "vellumwidget-legend-hidden";
        for (const s in legendOff) {
          if (!legendOff[s]) continue;
          const members = legendIndex[s] || [];
          addClassForKeys(members, cls);
          if (pol === "hide") for (let i = 0; i < members.length; i++) hiddenKeySet[members[i]] = true;
          addClassForKeys(legendSwatch[s] || [], "vellumwidget-legend-off");
        }
      }
      function legendToggle(series) {
        legendOff[series] = !legendOff[series];
        applyLegend();
      }
      function legendIsolate(series) {
        const all = Object.keys(legendIndex);
        const others = all.filter((s) => s !== series);
        const isolated = !legendOff[series] && others.every((s) => legendOff[s]);
        legendOff = {};
        if (!isolated) for (let i = 0; i < others.length; i++) legendOff[others[i]] = true;
        applyLegend();
      }
      function buildSpatialIndex() {
        spatialIndex = null;
        indexToElem = [];
        let count = 0;
        for (let i = 0; i < elements.length; i++) if (hasBbox(elements[i])) count++;
        if (!count) return;
        const idx = new Flatbush(count);
        for (let i = 0; i < elements.length; i++) {
          const e = elements[i];
          if (!hasBbox(e)) continue;
          idx.add(e.x0, e.y0, e.x1, e.y1);
          indexToElem.push(i);
        }
        idx.finish();
        spatialIndex = idx;
      }
      function buildHoverAxis() {
        const cx = [];
        const cy = [];
        for (let i = 0; i < elements.length; i++) {
          const e = elements[i];
          if (!hasBbox(e)) continue;
          cx.push({ c: (e.x0 + e.x1) / 2, k: e.key });
          cy.push({ c: (e.y0 + e.y1) / 2, k: e.key });
        }
        cx.sort((a, b) => a.c - b.c);
        cy.sort((a, b) => a.c - b.c);
        sortedCx = cx.map((p) => p.c);
        sortedCxKeys = cx.map((p) => p.k);
        sortedCy = cy.map((p) => p.c);
        sortedCyKeys = cy.map((p) => p.k);
        tolX = columnTolerance(sortedCx);
        tolY = columnTolerance(sortedCy);
      }
      function nearestAxisKey(axis, coord) {
        const sorted = axis === "x" ? sortedCx : sortedCy;
        const keys = axis === "x" ? sortedCxKeys : sortedCyKeys;
        const i = nearestSortedIdx(sorted, coord);
        return i >= 0 ? keys[i] : null;
      }
      function columnKeys(primary, axis) {
        const m = meta[primary];
        if (!m || !hasBbox(m)) return [primary];
        const cx = (m.x0 + m.x1) / 2;
        const cy = (m.y0 + m.y1) / 2;
        const SPAN = 1e7;
        const rect = axis === "x" ? { x0: cx - tolX, x1: cx + tolX, y0: -SPAN, y1: SPAN } : { x0: -SPAN, x1: SPAN, y0: cy - tolY, y1: cy + tolY };
        const ks = brushKeysIn(rect);
        return ks.length ? ks : [primary];
      }
      function nearestKeyAt(x, y, maxDist) {
        if (spatialIndex) {
          const ids = spatialIndex.neighbors(x, y, 1, maxDist);
          return ids.length ? elements[indexToElem[ids[0]]].key : null;
        }
        return nearestKey(elements, x, y, maxDist);
      }
      function brushKeysIn(rect) {
        if (!spatialIndex) return brushKeys(elements, rect);
        const eids = spatialIndex.search(rect.x0, rect.y0, rect.x1, rect.y1).map((id) => indexToElem[id]).sort((a, b) => a - b);
        const out = [];
        const seen = {};
        for (let i = 0; i < eids.length; i++) {
          const k = elements[eids[i]].key;
          if (!seen[k]) {
            seen[k] = true;
            out.push(k);
          }
        }
        return out;
      }
      function dimOpacityVal() {
        const d = opts.style && opts.style.dimOpacity;
        return d == null || d === "" ? "0.28" : String(d);
      }
      function showHighlightOverlay(keys) {
        if (!holder || !dimLayer) return;
        holder.style.opacity = dimOpacityVal();
        while (dimLayer.firstChild) dimLayer.removeChild(dimLayer.firstChild);
        for (let i = 0; i < keys.length; i++) {
          const nodes = elementsForKey(keys[i]);
          for (let j = 0; j < nodes.length; j++) {
            const c = nodes[j].cloneNode(true);
            c.classList.add("vellumwidget-hl");
            dimLayer.appendChild(c);
          }
        }
      }
      function hideHighlightOverlay() {
        if (holder) holder.style.opacity = "";
        if (dimLayer) while (dimLayer.firstChild) dimLayer.removeChild(dimLayer.firstChild);
      }
      function ensureCanvas() {
        if (canvasEl) return;
        canvasEl = document.createElement("canvas");
        canvasEl.className = "vellumwidget-canvas";
        canvasEl.setAttribute("aria-hidden", "true");
        (stage || el).appendChild(canvasEl);
        ctx = typeof canvasEl.getContext === "function" ? canvasEl.getContext("2d") : null;
      }
      function clearPointData() {
        ptCx = ptCy = ptRad = null;
        ptRGB = null;
        ptN = 0;
        if (canvasEl) canvasEl.style.display = "none";
      }
      function sampleBaseRaster() {
        clearPointData();
        if (!rasterMode || !svgEl || !vb0) return;
        const imgNode = svgEl.querySelector("image");
        const href = imgNode && (imgNode.getAttribute("href") || imgNode.getAttribute("xlink:href"));
        if (!href) return;
        const off = document.createElement("canvas");
        const octx = typeof off.getContext === "function" ? off.getContext("2d") : null;
        if (!octx) return;
        const iw = Math.max(1, Math.round(vb0.w));
        const ih = Math.max(1, Math.round(vb0.h));
        const els = elements;
        const v0 = vb0;
        const img = new Image();
        img.onload = function() {
          if (els !== elements || v0 !== vb0) return;
          off.width = iw;
          off.height = ih;
          octx.drawImage(img, 0, 0, iw, ih);
          let data;
          try {
            data = octx.getImageData(0, 0, iw, ih).data;
          } catch (e) {
            return;
          }
          const cx = [], cy = [], rad = [], rgb = [];
          for (let i = 0; i < els.length; i++) {
            const e = els[i];
            if (!hasBbox(e)) continue;
            const mx = (e.x0 + e.x1) / 2, my = (e.y0 + e.y1) / 2;
            const sx = Math.min(iw - 1, Math.max(0, Math.round(mx)));
            const sy = Math.min(ih - 1, Math.max(0, Math.round(my)));
            const o = (sy * iw + sx) * 4;
            if (data[o + 3] < 8) continue;
            cx.push(mx);
            cy.push(my);
            rad.push(Math.max(e.x1 - e.x0, e.y1 - e.y0) / 2 + 0.5);
            rgb.push(data[o], data[o + 1], data[o + 2]);
          }
          ptN = cx.length;
          ptCx = Float64Array.from(cx);
          ptCy = Float64Array.from(cy);
          ptRad = Float64Array.from(rad);
          ptRGB = Uint8Array.from(rgb);
          drawPoints();
        };
        img.onerror = function() {
        };
        img.src = href;
      }
      function drawPoints() {
        if (!rasterMode || !canvasEl || !ctx || !vb || !vb0) return;
        if (!isZoomedIn(vb, vb0) || !ptCx || !ptCy || !ptRad || !ptRGB || !ptN) {
          canvasEl.style.display = "none";
          return;
        }
        const rect = (svgEl || el).getBoundingClientRect();
        const cw = Math.max(1, Math.round(rect.width || vb0.w));
        const ch = Math.max(1, Math.round(rect.height || vb0.h));
        const dpr = window.devicePixelRatio || 1;
        if (canvasEl.width !== cw * dpr || canvasEl.height !== ch * dpr) {
          canvasEl.width = cw * dpr;
          canvasEl.height = ch * dpr;
        }
        canvasEl.style.width = cw + "px";
        canvasEl.style.height = ch + "px";
        canvasEl.style.display = "block";
        const W = canvasEl.width, H = canvasEl.height;
        ctx.clearRect(0, 0, W, H);
        const rScale = Math.min(W / vb.w, H / vb.h);
        const x0 = vb.x, y0 = vb.y, x1 = vb.x + vb.w, y1 = vb.y + vb.h;
        for (let i = 0; i < ptN; i++) {
          const px = ptCx[i], py = ptCy[i];
          if (px < x0 || px > x1 || py < y0 || py > y1) continue;
          const p = userToCanvas(vb, W, H, px, py);
          ctx.beginPath();
          ctx.arc(p.px, p.py, Math.max(0.75, ptRad[i] * rScale), 0, 6.283185307179586);
          ctx.fillStyle = "rgb(" + ptRGB[i * 3] + "," + ptRGB[i * 3 + 1] + "," + ptRGB[i * 3 + 2] + ")";
          ctx.fill();
        }
      }
      const SVGNS = "http://www.w3.org/2000/svg";
      function ringFor(k, cls) {
        const m = meta[k];
        if (!m || !hasBbox(m)) return null;
        const cx = (m.x0 + m.x1) / 2;
        const cy = (m.y0 + m.y1) / 2;
        const r = Math.max(m.x1 - m.x0, m.y1 - m.y0) / 2 + 2;
        const c = document.createElementNS(SVGNS, "circle");
        c.setAttribute("cx", String(cx));
        c.setAttribute("cy", String(cy));
        c.setAttribute("r", String(r));
        c.setAttribute("class", cls);
        c.setAttribute("vector-effect", "non-scaling-stroke");
        return c;
      }
      function clearGroup(g) {
        if (g) while (g.firstChild) g.removeChild(g.firstChild);
      }
      function drawSelFeedback() {
        clearGroup(selGroup);
        if (!selGroup) return;
        const keys = selectedKeys();
        if (keys.length > OVERLAY_MARK_CAP) return;
        for (let i = 0; i < keys.length; i++) {
          const c = ringFor(keys[i], "vellumwidget-fb-sel");
          if (c) selGroup.appendChild(c);
        }
      }
      function drawHovFeedback(keys) {
        clearGroup(hovGroup);
        if (!hovGroup) return;
        for (let i = 0; i < keys.length; i++) {
          const c = ringFor(keys[i], "vellumwidget-fb-hov");
          if (c) hovGroup.appendChild(c);
        }
      }
      function setHoverKeys(keys) {
        if (!opts.hover) return;
        if (rasterMode) {
          drawHovFeedback(keys);
          return;
        }
        clearClass("vellumwidget-hl");
        addClassForKeys(keys, "vellumwidget-hl");
        if (largeDim) showHighlightOverlay(keys);
        else el.classList.add("vellumwidget-hovering");
      }
      function setHover(k) {
        setHoverKeys(linkedKeys(k));
      }
      function crosshairLine(x1, y1, x2, y2) {
        const l = document.createElementNS(SVGNS, "line");
        l.setAttribute("x1", String(x1));
        l.setAttribute("y1", String(y1));
        l.setAttribute("x2", String(x2));
        l.setAttribute("y2", String(y2));
        l.setAttribute("class", "vellumwidget-crosshair-line");
        l.setAttribute("vector-effect", "non-scaling-stroke");
        return l;
      }
      function clearCrosshair() {
        if (crosshairLayer) while (crosshairLayer.firstChild) crosshairLayer.removeChild(crosshairLayer.firstChild);
      }
      function drawCrosshair(k, hm) {
        clearCrosshair();
        if (!crosshairLayer) return;
        const m = meta[k];
        if (!m || !hasBbox(m)) return;
        const view = vb || vb0;
        if (!view) return;
        const cx = (m.x0 + m.x1) / 2;
        const cy = (m.y0 + m.y1) / 2;
        const x0 = view.x, x1 = view.x + view.w, y0 = view.y, y1 = view.y + view.h;
        if (hm !== "y") crosshairLayer.appendChild(crosshairLine(cx, y0, cx, y1));
        if (hm !== "x") crosshairLayer.appendChild(crosshairLine(x0, cy, x1, cy));
      }
      function showTip(clientX, clientY, k) {
        const m = meta[k];
        tip.innerHTML = sanitizeTip(m && m.tooltip || k);
        const box = el.getBoundingClientRect();
        tip.style.transform = "translate(" + Math.round(clientX - box.left) + "px," + Math.round(clientY - box.top) + "px) translate(-50%, calc(-100% - 12px))";
        tip.classList.add("vellumwidget-show");
      }
      const TIP_MULTI_CAP = 30;
      function showTipMulti(clientX, clientY, keys) {
        const rows = [];
        for (let i = 0; i < keys.length && rows.length < TIP_MULTI_CAP; i++) {
          const m = meta[keys[i]];
          rows.push(sanitizeTip(m && m.tooltip || keys[i]));
        }
        if (keys.length > TIP_MULTI_CAP) rows.push("\u2026");
        tip.innerHTML = rows.join("<br>");
        const box = el.getBoundingClientRect();
        tip.style.transform = "translate(" + Math.round(clientX - box.left) + "px," + Math.round(clientY - box.top) + "px) translate(-50%, calc(-100% - 12px))";
        tip.classList.add("vellumwidget-show");
      }
      function hideTip() {
        tip.classList.remove("vellumwidget-show");
      }
      function clearHover() {
        if (rasterMode) clearGroup(hovGroup);
        if (largeDim) hideHighlightOverlay();
        el.classList.remove("vellumwidget-hovering");
        clearClass("vellumwidget-hl");
        clearCrosshair();
        hideTip();
        shinyInput("hover", null);
      }
      function shinyInput(event, value, opts2) {
        const hw = HTMLWidgets;
        const sh = window.Shiny;
        if (hw.shinyMode && sh && sh.setInputValue && el.id) {
          sh.setInputValue(el.id + "_" + event, value, opts2);
        }
      }
      function refreshSelected() {
        if (rasterMode) {
          drawSelFeedback();
          return;
        }
        clearClass("vellumwidget-selected");
        for (const k in selected) if (selected[k]) addClassForKeys([k], "vellumwidget-selected");
      }
      function selectedKeys() {
        return Object.keys(selected).filter((k) => selected[k]);
      }
      function broadcast() {
        const keys = selectedKeys();
        if (group) busPublish(group, selfToken, keys);
        if (ctSel) ctSel.set(keys);
        shinyInput("selected", keys);
      }
      function toggleSelect(k) {
        const ks = linkedKeys(k);
        if (opts.selectMode === "single") {
          const allOn = ks.every((x) => selected[x]) && selectedKeys().length === ks.length;
          selected = {};
          if (!allOn) ks.forEach((x) => selected[x] = true);
        } else {
          const turnOn = !ks.every((x) => selected[x]);
          ks.forEach((x) => selected[x] = turnOn);
        }
        refreshSelected();
        broadcast();
      }
      function setSelection(keys) {
        selected = {};
        for (let i = 0; i < keys.length; i++) selected[keys[i]] = true;
        refreshSelected();
        broadcast();
      }
      function clearSelection() {
        selected = {};
        refreshSelected();
        broadcast();
      }
      function applyLinkedSelection(keys) {
        selected = {};
        for (let i = 0; i < keys.length; i++) selected[keys[i]] = true;
        refreshSelected();
        shinyInput("selected", selectedKeys());
      }
      function applyFilter(showKeys) {
        clearClass("vellumwidget-filtered");
        if (showKeys == null) return;
        const show = {};
        for (let i = 0; i < showKeys.length; i++) show[showKeys[i]] = true;
        for (let i = 0; i < elements.length; i++) {
          const key = elements[i].key;
          if (!show[key]) addClassForKeys([key], "vellumwidget-filtered");
        }
      }
      function proxyCall(method, args) {
        const keys = Array.isArray(args) ? args : args == null ? [] : [String(args)];
        switch (method) {
          case "select":
            setSelection(keys);
            break;
          case "clearSelection":
            clearSelection();
            break;
          case "filter":
            applyFilter(keys);
            break;
          case "clearFilter":
            applyFilter(null);
            break;
          case "zoom":
            proxyZoomToKeys(keys);
            break;
          case "resetZoom":
            resetZoom();
            break;
          default:
            break;
        }
      }
      function proxyZoomToKeys(keys) {
        if (!keys.length) {
          resetZoom();
          return;
        }
        const sel = {};
        for (let i = 0; i < keys.length; i++) sel[keys[i]] = true;
        const bb = unionBbox(elements, sel);
        if (bb) zoomTo(bb);
      }
      function setupLinking() {
        if (joined) return;
        joined = true;
        if (group) busJoin(group, { token: selfToken, onSelect: applyLinkedSelection });
        const ct = getCrosstalk();
        if (opts.crosstalk && ct) {
          ctSel = new ct.SelectionHandle(opts.crosstalk);
          ctFilt = new ct.FilterHandle(opts.crosstalk);
          ctSel.on("change", function(e) {
            if (e.sender !== ctSel) applyLinkedSelection(e.value || []);
          });
          ctFilt.on("change", function(e) {
            applyFilter(e.value);
          });
        }
      }
      function applyViewBox() {
        if (svgEl && vb) svgEl.setAttribute("viewBox", fmtViewBox(vb));
        if (dimLayer && vb) dimLayer.setAttribute("viewBox", fmtViewBox(vb));
        if (crosshairLayer && vb) crosshairLayer.setAttribute("viewBox", fmtViewBox(vb));
        drawPoints();
      }
      function resetZoom() {
        if (vb0) {
          vb = { x: vb0.x, y: vb0.y, w: vb0.w, h: vb0.h };
          applyViewBox();
        }
      }
      function zoomTo(rect, pad = 0.05) {
        if (!vb) return;
        const w = Math.max(rect.x1 - rect.x0, 1e-6);
        const h = Math.max(rect.y1 - rect.y0, 1e-6);
        const px = w * pad;
        const py = h * pad;
        vb = { x: rect.x0 - px, y: rect.y0 - py, w: w + 2 * px, h: h + 2 * py };
        applyViewBox();
      }
      function positionBrush(x, y, w, h) {
        brushBox.style.left = x + "px";
        brushBox.style.top = y + "px";
        brushBox.style.width = w + "px";
        brushBox.style.height = h + "px";
        brushBox.style.display = "block";
      }
      function hideBrush() {
        brushBox.style.display = "none";
      }
      let down = null;
      let dragging = "";
      let movedDuringDrag = false;
      const pointers = /* @__PURE__ */ new Map();
      let pinchDist = 0;
      function hoverAt(k, clientX, clientY) {
        if (k != null && hiddenKeySet[k]) k = null;
        if (k == null) {
          clearHover();
          return;
        }
        shinyInput("hover", k);
        const hm = opts.hoverMode || "closest";
        if (hm === "x" || hm === "y") {
          const keys = columnKeys(k, hm).filter((key) => !hiddenKeySet[key]);
          if (!keys.length) {
            clearHover();
            return;
          }
          setHoverKeys(keys);
          if (opts.crosshair) drawCrosshair(k, hm);
          if (opts.tooltip) showTipMulti(clientX, clientY, keys);
        } else {
          const keys = linkedKeys(k).filter((key) => !hiddenKeySet[key]);
          if (!keys.length) {
            clearHover();
            return;
          }
          setHoverKeys(keys);
          if (opts.crosshair) drawCrosshair(k, "closest");
          if (opts.tooltip) showTip(clientX, clientY, k);
        }
      }
      function onHoverMove(ev) {
        if (down || pinchDist > 0) return;
        const hm = opts.hoverMode || "closest";
        const k = keyOf(ev.target);
        if (k != null) {
          if (hoverRAF) {
            cancelAnimationFrame(hoverRAF);
            hoverRAF = 0;
          }
          hoverAt(k, ev.clientX, ev.clientY);
          return;
        }
        if (!elements.length || hm === "closest" && !opts.nearest) {
          clearHover();
          return;
        }
        const cx = ev.clientX;
        const cy = ev.clientY;
        if (hoverRAF) return;
        hoverRAF = requestAnimationFrame(function() {
          hoverRAF = 0;
          const u = toUser(cx, cy);
          let seed;
          if (hm === "x") seed = nearestAxisKey("x", u.x);
          else if (hm === "y") seed = nearestAxisKey("y", u.y);
          else seed = nearestKeyAt(u.x, u.y, vb ? vb.w * 0.02 : 8);
          hoverAt(seed, cx, cy);
        });
      }
      function onDragMove(ev) {
        if (pointers.has(ev.pointerId)) {
          pointers.set(ev.pointerId, { cx: ev.clientX, cy: ev.clientY });
        }
        if (pinchDist > 0 && pointers.size >= 2 && vb) {
          const pts = Array.from(pointers.values());
          const d = Math.hypot(pts[0].cx - pts[1].cx, pts[0].cy - pts[1].cy);
          if (d > 0) {
            const u = toUser((pts[0].cx + pts[1].cx) / 2, (pts[0].cy + pts[1].cy) / 2);
            vb = zoomViewBox(vb, d / pinchDist, u.x, u.y);
            applyViewBox();
            pinchDist = d;
          }
          return;
        }
        if (!down) return;
        if (!dragging) {
          if (Math.abs(ev.clientX - down.cx) + Math.abs(ev.clientY - down.cy) <= DRAG_THRESHOLD) return;
          dragging = mode === "pan" && opts.zoom ? "pan" : opts.brush ? "brush" : "";
          if (dragging === "pan") el.classList.add("vellumwidget-panning");
          if (dragging === "") return;
          movedDuringDrag = true;
        }
        if (dragging === "brush") {
          const box = el.getBoundingClientRect();
          positionBrush(
            Math.min(down.cx, ev.clientX) - box.left,
            Math.min(down.cy, ev.clientY) - box.top,
            Math.abs(ev.clientX - down.cx),
            Math.abs(ev.clientY - down.cy)
          );
        } else if (dragging === "pan" && vb) {
          const u = toUser(ev.clientX, ev.clientY);
          vb.x -= u.x - down.ux;
          vb.y -= u.y - down.uy;
          applyViewBox();
          const u2 = toUser(ev.clientX, ev.clientY);
          down.ux = u2.x;
          down.uy = u2.y;
        }
      }
      function onDown(ev) {
        if (ev.pointerType === "mouse" && ev.button !== 0) return;
        pointers.set(ev.pointerId, { cx: ev.clientX, cy: ev.clientY });
        window.addEventListener("pointermove", onDragMove);
        window.addEventListener("pointerup", onDragUp);
        window.addEventListener("pointercancel", onDragUp);
        if (pointers.size >= 2 && opts.zoom) {
          const pts = Array.from(pointers.values());
          pinchDist = Math.hypot(pts[0].cx - pts[1].cx, pts[0].cy - pts[1].cy);
          down = null;
          dragging = "";
          hideBrush();
          el.classList.remove("vellumwidget-panning");
          return;
        }
        const u = toUser(ev.clientX, ev.clientY);
        down = { cx: ev.clientX, cy: ev.clientY, ux: u.x, uy: u.y };
        dragging = "";
        movedDuringDrag = false;
      }
      function onDragUp(ev) {
        pointers.delete(ev.pointerId);
        const wasPinch = pinchDist > 0;
        if (pointers.size < 2) pinchDist = 0;
        if (pointers.size === 0) {
          window.removeEventListener("pointermove", onDragMove);
          window.removeEventListener("pointerup", onDragUp);
          window.removeEventListener("pointercancel", onDragUp);
        }
        if (wasPinch) {
          down = null;
          dragging = "";
          el.classList.remove("vellumwidget-panning");
          hideBrush();
          return;
        }
        if (dragging === "brush" && down) {
          const p1 = toUser(down.cx, down.cy);
          const p2 = toUser(ev.clientX, ev.clientY);
          const rect = {
            x0: Math.min(p1.x, p2.x),
            y0: Math.min(p1.y, p2.y),
            x1: Math.max(p1.x, p2.x),
            y1: Math.max(p1.y, p2.y)
          };
          lastBrush = rect;
          const hitKeys = brushKeysIn(rect);
          if (opts.select) setSelection(hitKeys);
          shinyInput("brush", { keys: hitKeys, x0: rect.x0, y0: rect.y0, x1: rect.x1, y1: rect.y1 }, { priority: "event" });
          hideBrush();
        }
        el.classList.remove("vellumwidget-panning");
        down = null;
        dragging = "";
      }
      function onClick(ev) {
        if (movedDuringDrag) {
          movedDuringDrag = false;
          return;
        }
        let k = keyOf(ev.target);
        if (k == null && rasterMode && opts.nearest !== false && elements.length) {
          const u = toUser(ev.clientX, ev.clientY);
          const rad = vb ? vb.w * 0.02 : 8;
          k = nearestKeyAt(u.x, u.y, rad);
        }
        shinyInput("click", { key: k }, { priority: "event" });
        const series = swatchSeries(k);
        if (series != null && legendPolicy() !== "select") {
          if (!(ev.detail && ev.detail >= 2)) legendToggle(series);
          return;
        }
        if (k != null) {
          if (opts.select) toggleSelect(k);
        } else {
          clearSelection();
          lastBrush = null;
        }
      }
      function onDblClick(ev) {
        const series = swatchSeries(keyOf(ev.target));
        if (series != null && legendPolicy() !== "select") legendIsolate(series);
      }
      function onWheel(ev) {
        if (!opts.zoom || !vb) return;
        ev.preventDefault();
        const u = toUser(ev.clientX, ev.clientY);
        const factor = ev.deltaY < 0 ? 1.2 : 1 / 1.2;
        vb = zoomViewBox(vb, factor, u.x, u.y);
        applyViewBox();
      }
      function onKey(ev) {
        if (ev.key === "Escape") {
          clearSelection();
          clearHover();
          clearClass("vellumwidget-focus");
          hideBrush();
          lastBrush = null;
          if (markFocused() && typeof el.focus === "function") el.focus();
          focusIdx = -1;
          return;
        }
        if (opts.a11y && markFocused()) {
          const k = focusables[focusIdx].key;
          if (ev.key === "ArrowRight" || ev.key === "ArrowDown") {
            focusRoving(focusIdx + 1);
            ev.preventDefault();
            return;
          }
          if (ev.key === "ArrowLeft" || ev.key === "ArrowUp") {
            focusRoving(focusIdx - 1);
            ev.preventDefault();
            return;
          }
          if (ev.key === "Enter" || ev.key === " " || ev.key === "Spacebar") {
            const series = swatchSeries(k);
            if (series != null && legendPolicy() !== "select") {
              legendToggle(series);
              announce(a11yLabel(k) + (legendOff[series] ? ", hidden" : ", shown"));
            } else {
              if (opts.select) toggleSelect(k);
              announce(a11yLabel(k) + (selected[k] ? ", selected" : ", not selected"));
            }
            ev.preventDefault();
            return;
          }
        }
        if (!opts.zoom || !vb) return;
        if (ev.key === "0") {
          resetZoom();
          ev.preventDefault();
          return;
        }
        const dx = vb.w * 0.12;
        const dy = vb.h * 0.12;
        const cx = vb.x + vb.w / 2;
        const cy = vb.y + vb.h / 2;
        let handled = true;
        switch (ev.key) {
          case "ArrowLeft":
            vb.x -= dx;
            break;
          case "ArrowRight":
            vb.x += dx;
            break;
          case "ArrowUp":
            vb.y -= dy;
            break;
          case "ArrowDown":
            vb.y += dy;
            break;
          case "+":
          case "=":
            vb = zoomViewBox(vb, 1.2, cx, cy);
            break;
          case "-":
          case "_":
            vb = zoomViewBox(vb, 1 / 1.2, cx, cy);
            break;
          default:
            handled = false;
        }
        if (handled) {
          applyViewBox();
          ev.preventDefault();
        }
      }
      function setMode(m) {
        mode = m;
        el.classList.toggle("vellumwidget-mode-pan", m === "pan");
        if (toolbarEl) {
          const b = toolbarEl.querySelector('[data-act="mode"]');
          if (b) {
            b.textContent = m === "pan" ? "\u270B" : "\u25AD";
            b.title = m === "pan" ? "Pan mode (click to brush-select)" : "Brush-select mode (click to pan)";
            b.classList.toggle("vellumwidget-active", m === "pan");
          }
        }
      }
      function exportName() {
        const n = opts.export && opts.export.filename;
        return n && String(n).length ? String(n) : "plot";
      }
      function exportScale() {
        const s = opts.export && opts.export.scale;
        return s && s > 0 ? s : 1;
      }
      function saveSvg() {
        if (!svgEl) return;
        const s = new XMLSerializer().serializeToString(svgEl);
        download(new Blob([s], { type: "image/svg+xml;charset=utf-8" }), exportName() + ".svg");
      }
      function toCanvas(then, fail) {
        if (!svgEl) return fail();
        const s = new XMLSerializer().serializeToString(svgEl);
        const url = URL.createObjectURL(new Blob([s], { type: "image/svg+xml;charset=utf-8" }));
        const img = new Image();
        img.onload = function() {
          const k = exportScale();
          const canvas = document.createElement("canvas");
          canvas.width = Math.round((vb0 ? vb0.w : img.width) * k);
          canvas.height = Math.round((vb0 ? vb0.h : img.height) * k);
          const ctx2 = canvas.getContext("2d");
          URL.revokeObjectURL(url);
          if (ctx2) {
            ctx2.drawImage(img, 0, 0, canvas.width, canvas.height);
            then(canvas);
          } else {
            fail();
          }
        };
        img.onerror = function() {
          URL.revokeObjectURL(url);
          fail();
        };
        img.src = url;
      }
      function savePng() {
        toCanvas(
          function(canvas) {
            canvas.toBlob(function(b) {
              if (b) download(b, exportName() + ".png");
            });
          },
          saveSvg
          // canvas tainted / unsupported -> fall back to SVG
        );
      }
      function canCopy() {
        const nav = navigator;
        return !!(nav.clipboard && nav.clipboard.write && typeof ClipboardItem !== "undefined");
      }
      function copyPng() {
        if (!canCopy()) return;
        toCanvas(
          function(canvas) {
            canvas.toBlob(function(b) {
              if (!b) return;
              const nav = navigator;
              nav.clipboard.write([new ClipboardItem({ "image/png": b })]).catch(function() {
              });
            });
          },
          function() {
          }
        );
      }
      function toggleFullscreen() {
        const anyEl = el;
        const anyDoc = document;
        if (anyDoc.fullscreenElement) {
          if (anyDoc.exitFullscreen) anyDoc.exitFullscreen();
        } else if (anyEl.requestFullscreen) {
          anyEl.requestFullscreen();
        }
      }
      function zoomToSelection() {
        const rect = lastBrush || unionBbox(elements, selected);
        if (rect) zoomTo(rect);
      }
      function buildToolbar() {
        if (toolbarEl) {
          toolbarEl.remove();
          toolbarEl = null;
        }
        if (!opts.toolbar) return;
        const bar = document.createElement("div");
        bar.className = "vellumwidget-toolbar";
        const btn = (act, label, title, fn) => {
          const b = document.createElement("button");
          b.setAttribute("data-act", act);
          b.textContent = label;
          b.title = title;
          b.addEventListener("click", function(e) {
            e.stopPropagation();
            fn();
          });
          bar.appendChild(b);
          return b;
        };
        if (opts.brush && opts.zoom) btn("mode", "\u25AD", "Brush-select mode (click to pan)", () => setMode(mode === "brush" ? "pan" : "brush"));
        if (opts.zoom) {
          btn("zoomsel", "\u2316", "Zoom to selection", zoomToSelection);
          btn("reset", "\u27F2", "Reset zoom", resetZoom);
        }
        btn("svg", "SVG", "Download SVG", saveSvg);
        btn("png", "PNG", "Download PNG", savePng);
        if (canCopy()) btn("copy", "\u29C9", "Copy PNG to clipboard", copyPng);
        btn("full", "\u26F6", "Fullscreen", toggleFullscreen);
        el.appendChild(bar);
        toolbarEl = bar;
      }
      function applyStyling() {
        const s = opts.style || {};
        const setRoot = (name, v) => {
          if (v != null && v !== "") el.style.setProperty(name, String(v));
          else el.style.removeProperty(name);
        };
        setRoot("--vellumwidget-dim-opacity", s.dimOpacity);
        setRoot("--vellumwidget-selected-stroke", s.selectedColor);
        setRoot("--vellumwidget-tip-bg", s.tipBg);
        setRoot("--vellumwidget-tip-fg", s.tipFg);
        setRoot("--vellumwidget-tip-fontsize", s.tipFontSize);
        setRoot("--vellumwidget-tip-maxwidth", s.tipMaxWidth);
        if (s.hoverColor != null && s.hoverColor !== "") {
          el.style.setProperty("--vellumwidget-hl-stroke", s.hoverColor);
          el.classList.add("vellumwidget-hc-all");
        } else {
          el.style.removeProperty("--vellumwidget-hl-stroke");
          el.classList.remove("vellumwidget-hc-all");
        }
        for (let i = 0; i < elements.length; i++) {
          const e = elements[i];
          if (e.hover_color == null && e.selected_color == null && e.legend_for == null) continue;
          const nodes = elementsForKey(e.key);
          for (let j = 0; j < nodes.length; j++) {
            const n = nodes[j];
            if (e.hover_color != null) {
              n.style.setProperty("--vellumwidget-hl-stroke", e.hover_color);
              n.classList.add("vellumwidget-hc");
            }
            if (e.selected_color != null) {
              n.style.setProperty("--vellumwidget-selected-stroke", e.selected_color);
            }
            if (e.legend_for != null) n.classList.add("vellumwidget-legend");
          }
        }
      }
      function a11yLabel(k) {
        const m = meta[k];
        return m && m.tooltip ? stripTags(m.tooltip) : k;
      }
      function focusLabel(k) {
        return a11yLabel(k) + (selected[k] ? ", selected" : "");
      }
      function announce(msg) {
        if (liveRegion && liveRegion.textContent !== msg) liveRegion.textContent = msg;
      }
      function showMarkFocus(i) {
        focusIdx = i;
        const k = focusables[i].key;
        clearClass("vellumwidget-focus");
        addClassForKeys([k], "vellumwidget-focus");
        setHover(k);
        announce(focusLabel(k));
      }
      function onMarkFocus(ev) {
        const k = keyOf(ev.target);
        if (k == null) return;
        const i = focusables.findIndex((f) => f.key === k);
        if (i >= 0) showMarkFocus(i);
      }
      function onMarkBlur(ev) {
        const to = keyOf(ev.relatedTarget);
        if (to == null) {
          focusIdx = -1;
          clearClass("vellumwidget-focus");
        }
      }
      function focusRoving(i) {
        if (!focusables.length) return;
        const dir = i < focusIdx ? -1 : 1;
        if (i < 0) i = 0;
        if (i >= focusables.length) i = focusables.length - 1;
        while (focusables[i] && focusables[i].node.classList.contains("vellumwidget-filtered")) {
          i += dir;
          if (i < 0 || i >= focusables.length) return;
        }
        if (focusIdx >= 0 && focusables[focusIdx]) {
          focusables[focusIdx].node.setAttribute("tabindex", "-1");
        }
        const f = focusables[i];
        f.node.setAttribute("tabindex", "0");
        showMarkFocus(i);
        const n = f.node;
        if (typeof n.focus === "function") n.focus();
      }
      function markFocused() {
        return opts.a11y && focusIdx >= 0 && !!focusables[focusIdx];
      }
      function buildDataTable() {
        if (tableEl) {
          tableEl.remove();
          tableEl = null;
        }
        if (!opts.a11y || !elements.length) return;
        const tbl = document.createElement("table");
        tbl.className = "vellumwidget-sr-only vellumwidget-data-table";
        const cap = document.createElement("caption");
        cap.textContent = "Data table";
        tbl.appendChild(cap);
        const head = document.createElement("tr");
        const h1 = document.createElement("th");
        h1.setAttribute("scope", "col");
        h1.textContent = "Item";
        const h2 = document.createElement("th");
        h2.setAttribute("scope", "col");
        h2.textContent = "Description";
        head.appendChild(h1);
        head.appendChild(h2);
        tbl.appendChild(head);
        const seen = {};
        for (let i = 0; i < elements.length; i++) {
          const k = elements[i].key;
          if (seen[k]) continue;
          seen[k] = true;
          const tr = document.createElement("tr");
          const th = document.createElement("th");
          th.setAttribute("scope", "row");
          th.textContent = k;
          const td = document.createElement("td");
          td.textContent = a11yLabel(k);
          tr.appendChild(th);
          tr.appendChild(td);
          tbl.appendChild(tr);
        }
        el.appendChild(tbl);
        tableEl = tbl;
      }
      function setupA11y() {
        focusables = [];
        focusIdx = -1;
        if (!opts.a11y || !svgEl) {
          buildDataTable();
          return;
        }
        if (rasterMode) {
          svgEl.setAttribute("role", "img");
          if (opts.alt) {
            svgEl.removeAttribute("aria-labelledby");
            svgEl.setAttribute("aria-label", opts.alt);
          } else if (!svgEl.getAttribute("aria-labelledby") && !svgEl.getAttribute("aria-label")) {
            svgEl.setAttribute("aria-label", "Chart");
          }
          return;
        }
        svgEl.setAttribute("role", "graphics-document");
        svgEl.setAttribute("aria-roledescription", "interactive chart");
        if (opts.alt) {
          svgEl.removeAttribute("aria-labelledby");
          svgEl.setAttribute("aria-label", opts.alt);
        } else if (!svgEl.getAttribute("aria-labelledby") && !svgEl.getAttribute("aria-label")) {
          svgEl.setAttribute("aria-label", "Interactive chart");
        }
        if (!liveRegion) {
          liveRegion = document.createElement("div");
          liveRegion.className = "vellumwidget-sr-only";
          liveRegion.setAttribute("role", "status");
          liveRegion.setAttribute("aria-live", "polite");
          el.appendChild(liveRegion);
        } else {
          liveRegion.textContent = "";
        }
        const seen = {};
        for (let i = 0; i < elements.length; i++) {
          const k = elements[i].key;
          if (seen[k]) continue;
          const nodes = nodesByKey[k];
          if (!nodes || !nodes.length) continue;
          seen[k] = true;
          const node = nodes[0];
          node.setAttribute("role", "graphics-symbol");
          node.setAttribute("tabindex", "-1");
          node.setAttribute("aria-label", a11yLabel(k));
          node.addEventListener("focus", onMarkFocus);
          node.addEventListener("blur", onMarkBlur);
          focusables.push({ key: k, node });
        }
        if (focusables.length) focusables[0].node.setAttribute("tabindex", "0");
        buildDataTable();
      }
      function wire(svg) {
        svg.addEventListener("pointermove", onHoverMove);
        svg.addEventListener("pointerleave", clearHover);
        svg.addEventListener("pointerdown", onDown);
        svg.addEventListener("click", onClick);
        svg.addEventListener("dblclick", onDblClick);
        if (opts.zoom) svg.addEventListener("wheel", onWheel, { passive: false });
        if (opts.zoom || opts.brush) el.classList.add("vellumwidget-gesture");
        el.setAttribute("tabindex", "0");
        el.addEventListener("keydown", onKey);
      }
      return {
        renderValue: function(x) {
          opts = Object.assign(
            { tooltip: true, hover: true, select: true, brush: true, zoom: true, toolbar: true, nearest: true, a11y: true, selectMode: "multiple", hoverMode: "closest", crosshair: false },
            x.options || {}
          );
          elements = normalizeElements(x.elements);
          meta = {};
          groups = {};
          legendIndex = {};
          legendSwatch = {};
          legendOff = {};
          hiddenKeySet = {};
          selected = {};
          lastBrush = null;
          mode = "brush";
          group = opts.group || null;
          for (let i = 0; i < elements.length; i++) {
            const e = elements[i];
            meta[e.key] = e;
            if (e.hover_group != null) (groups[e.hover_group] = groups[e.hover_group] || []).push(e.key);
            if (e.legend != null) {
              const series = Array.isArray(e.legend) ? e.legend : [e.legend];
              for (let s = 0; s < series.length; s++) {
                (legendIndex[series[s]] = legendIndex[series[s]] || []).push(e.key);
              }
            }
            if (e.legend_for != null) (legendSwatch[e.legend_for] = legendSwatch[e.legend_for] || []).push(e.key);
          }
          if (!holder) {
            stage = document.createElement("div");
            stage.className = "vellumwidget-stage";
            el.appendChild(stage);
            holder = document.createElement("div");
            holder.className = "vellumwidget-svg-holder";
            stage.appendChild(holder);
            dimLayer = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            dimLayer.setAttribute("class", "vellumwidget-dim-layer");
            dimLayer.setAttribute("aria-hidden", "true");
            crosshairLayer = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            crosshairLayer.setAttribute("class", "vellumwidget-crosshair-layer");
            crosshairLayer.setAttribute("aria-hidden", "true");
            stage.appendChild(crosshairLayer);
            stage.appendChild(dimLayer);
            el.appendChild(brushBox);
            el.appendChild(tip);
          }
          holder.innerHTML = x.svg;
          svgEl = holder.querySelector("svg");
          nodesByKey = {};
          if (holder) {
            const keyed = holder.querySelectorAll("[data-key]");
            for (let i = 0; i < keyed.length; i++) {
              const k = keyed[i].getAttribute("data-key");
              if (k != null) (nodesByKey[k] = nodesByKey[k] || []).push(keyed[i]);
            }
          }
          if (svgEl) {
            vb0 = parseViewBox(svgEl.getAttribute("viewBox"));
            if (!vb0) {
              const w = parseFloat(svgEl.getAttribute("width") || "0");
              const h = parseFloat(svgEl.getAttribute("height") || "0");
              if (w && h) vb0 = { x: 0, y: 0, w, h };
            }
            vb = vb0 ? { x: vb0.x, y: vb0.y, w: vb0.w, h: vb0.h } : null;
            hideHighlightOverlay();
            rasterMode = !!opts.raster;
            largeDim = !rasterMode && elements.length > DIM_OVERLAY_MIN;
            selGroup = null;
            hovGroup = null;
            if (rasterMode && dimLayer) {
              selGroup = document.createElementNS(SVGNS, "g");
              hovGroup = document.createElementNS(SVGNS, "g");
              dimLayer.appendChild(selGroup);
              dimLayer.appendChild(hovGroup);
            }
            if (dimLayer && vb0) dimLayer.setAttribute("viewBox", fmtViewBox(vb0));
            if (crosshairLayer && vb0) crosshairLayer.setAttribute("viewBox", fmtViewBox(vb0));
            clearCrosshair();
            if (rasterMode) {
              ensureCanvas();
              sampleBaseRaster();
            } else {
              clearPointData();
            }
            buildSpatialIndex();
            buildHoverAxis();
            wire(svgEl);
            buildToolbar();
            setMode("brush");
            applyStyling();
            applyLegend();
            setupA11y();
            setupLinking();
            shinyInput("selected", selectedKeys());
            registerProxyHandler();
          }
        },
        resize: function() {
          drawPoints();
        },
        // Server->client proxy seam: vellumwidget_proxy() reaches this instance via
        // HTMLWidgets.find() and calls `_call` (see the "vellumwidget-calls" handler).
        _call: proxyCall,
        // Test seam: the index-backed query functions + hover-mode flags, so the
        // headless suite can verify the spatial index with explicit coordinates
        // (jsdom has no layout, so client->user coordinate mapping is degenerate).
        _test: {
          nearestKeyAt,
          brushKeysIn,
          indexSize: function() {
            return spatialIndex ? spatialIndex.numItems : 0;
          },
          largeDim: function() {
            return largeDim;
          },
          rasterMode: function() {
            return rasterMode;
          },
          hasCanvas: function() {
            return !!canvasEl;
          },
          pointCount: function() {
            return ptN;
          },
          hoverMode: function() {
            return opts.hoverMode || "closest";
          },
          columnKeys,
          nearestAxisKey,
          legendOff: function() {
            return Object.keys(legendOff).filter((s) => legendOff[s]);
          }
        }
      };
    }
  });
  function dispatchProxyCall(msg, findInstance) {
    if (!msg || msg.id == null) return;
    const inst = findInstance(msg.id);
    if (inst && typeof inst._call === "function") inst._call(msg.method, msg.args);
  }
  var proxyHandlerRegistered = false;
  function registerProxyHandler() {
    if (proxyHandlerRegistered) return;
    const sh = window.Shiny;
    if (!sh || typeof sh.addCustomMessageHandler !== "function") return;
    proxyHandlerRegistered = true;
    sh.addCustomMessageHandler("vellumwidget-calls", function(msg) {
      dispatchProxyCall(msg, function(id) {
        return HTMLWidgets.find ? HTMLWidgets.find("#" + id) : null;
      });
    });
  }
  registerProxyHandler();
  window.__vellumwidgetTest = {
    rectsIntersect,
    distToBbox,
    brushKeys,
    nearestKey,
    zoomViewBox,
    parseViewBox,
    fmtViewBox,
    unionBbox,
    sanitizeTip,
    dispatchProxyCall,
    normalizeElements,
    isZoomedIn,
    userToCanvas,
    nearestSortedIdx,
    columnTolerance
  };
})();
