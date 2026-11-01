(() => {
  // vendor/graph-embedded-renderer/src/index.ts
  var SVG_NS = "http://www.w3.org/2000/svg";
  var COLORS = ["#2563eb", "#dc2626", "#059669", "#9333ea", "#d97706", "#0891b2"];
  var AXES = ["x", "y"];
  var rendererSequence = 0;
  function fail(message) {
    throw new TypeError(`GraphRenderer: ${message}`);
  }
  function identifier(value, name) {
    if (typeof value !== "string" || !value.trim()) fail(`${name} must be a nonempty string`);
    return value;
  }
  function label(value, fallback, name) {
    if (value !== void 0 && typeof value !== "string") fail(`${name} must be a string`);
    return value === void 0 ? fallback : value;
  }
  function domain(value, name) {
    if (!Array.isArray(value) || value.length !== 2 || !value.every(Number.isFinite) || value[0] >= value[1] || !Number.isFinite(value[1] - value[0])) {
      fail(`${name} must be [min, max] with finite numbers and min < max`);
    }
    return [value[0], value[1]];
  }
  function records(value, name) {
    if (!Array.isArray(value)) fail(`${name} must be an array`);
    return value;
  }
  function object(value, name) {
    if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${name} must be an object`);
  }
  function unique(map, id, name) {
    identifier(id, `${name} id`);
    if (map.has(id)) fail(`duplicate ${name} id "${id}"`);
  }
  function pointValues(input, variables, name) {
    object(input, name);
    const values = /* @__PURE__ */ Object.create(null);
    for (const [key, value] of Object.entries(input)) {
      if (!variables.has(key)) fail(`${name} references unknown variable "${key}"`);
      if (typeof value !== "number" || !Number.isFinite(value)) fail(`${name}.${key} must be a finite number`);
      values[key] = value;
    }
    return values;
  }
  function color(value, fallback, name) {
    if (value === void 0) return fallback;
    if (typeof value !== "string" || !value.trim() || /[;{}<>]|(?:url|expression)\s*\(/i.test(value)) {
      fail(`${name} must be a CSS color, not a paint URL or CSS declaration`);
    }
    return value;
  }
  function numberLabel(value) {
    if (value === 0) return "0";
    const magnitude = Math.abs(value);
    return magnitude >= 1e6 || magnitude < 1e-4 ? value.toExponential(3).replace(/\.?0+e/, "e") : String(Number(value.toPrecision(6)));
  }
  function mathLabel(value) {
    return value.replace(/(?<![\p{L}\p{Nd}])[A-Za-z](?![\p{L}\p{Nd}])/gu, (letter) => {
      if (letter === "h") return "\u210E";
      return String.fromCodePoint(letter >= "a" ? 119886 + letter.charCodeAt(0) - 97 : 119860 + letter.charCodeAt(0) - 65);
    });
  }
  function ticks([min, max], count) {
    const raw = (max - min) / count;
    const scale = 10 ** Math.floor(Math.log10(raw));
    if (!Number.isFinite(scale) || scale === 0) return [];
    const ratio = raw / scale;
    const step = (ratio <= 1 ? 1 : ratio <= 2 ? 2 : ratio <= 5 ? 5 : 10) * scale;
    const first = Math.ceil(min / step);
    const result = [];
    for (let i = 0; i < 100; i += 1) {
      const value = (first + i) * step;
      if (value > max + step * 1e-8) break;
      if (Number.isFinite(value)) result.push(Math.abs(value) < step * 1e-10 ? 0 : value);
    }
    return result;
  }
  var GraphRenderer = class {
    _variables = /* @__PURE__ */ new Map();
    _datasets = /* @__PURE__ */ new Map();
    _graphs = /* @__PURE__ */ new Map();
    _listeners = [];
    _pointers = /* @__PURE__ */ new Map();
    _destroyed = false;
    _onChange;
    _document;
    _container;
    _prefix;
    _root = null;
    _observer = null;
    constructor(container, options = {}) {
      if (!container || container.nodeType !== 1 || !container.ownerDocument || typeof container.appendChild !== "function") fail("container must be a DOM element");
      object(options, "options");
      if (options.onChange !== void 0 && typeof options.onChange !== "function") {
        fail("onChange must be a function");
      }
      this._onChange = options.onChange;
      this._validate(options);
      this._document = container.ownerDocument;
      this._container = container;
      this._prefix = `bmg-${++rendererSequence}`;
      this._build();
      container.appendChild(this._root);
      const window2 = this._document.defaultView;
      const Observer = window2?.ResizeObserver || globalThis.ResizeObserver;
      if (Observer) {
        this._observer = new Observer(() => {
          if (!this._destroyed) this._render();
        });
        this._observer.observe(this._root);
        for (const graph of this._graphs.values()) this._observer.observe(graph.svg);
      } else if (window2) {
        this._listen(window2, "resize", () => this._render());
      }
      this._listen(this._document, "pointermove", (event) => this._pointerMove(event), { passive: false });
      this._listen(this._document, "pointerup", (event) => this._pointerEnd(event));
      this._listen(this._document, "pointercancel", (event) => this._pointerEnd(event));
      this._listen(this._document, "pointerdown", (event) => {
        if (!this._root.contains(event.target)) this._closeAxes();
      });
      this._render();
    }
    _validate(options) {
      object(options, "options");
      for (const entry of records(options.variables, "variables")) {
        object(entry, "variable");
        unique(this._variables, entry.id, "variable");
        this._variables.set(entry.id, {
          id: entry.id,
          label: label(entry.label, entry.id, `variable "${entry.id}" label`),
          domain: domain(entry.domain, `variable "${entry.id}" domain`)
        });
      }
      if (!this._variables.size) fail("variables must contain at least one variable");
      for (const entry of records(options.datasets ?? [], "datasets")) {
        object(entry, "dataset");
        unique(this._datasets, entry.id, "dataset");
        const points = /* @__PURE__ */ new Map();
        for (const point of records(entry.points, `dataset "${entry.id}" points`)) {
          object(point, "point");
          unique(points, point.id, `point in dataset "${entry.id}"`);
          points.set(point.id, {
            id: point.id,
            values: pointValues(point.values, this._variables, `point "${point.id}" values`)
          });
        }
        this._datasets.set(entry.id, {
          id: entry.id,
          label: label(entry.label, entry.id, `dataset "${entry.id}" label`),
          color: color(entry.color, COLORS[this._datasets.size % COLORS.length], "dataset color"),
          points
        });
      }
      for (const entry of records(options.graphs, "graphs")) {
        object(entry, "graph");
        unique(this._graphs, entry.id, "graph");
        this._axis(entry.x, "x");
        this._axis(entry.y, "y");
        if (entry.visible !== void 0 && typeof entry.visible !== "boolean") fail("graph visible must be boolean");
        const syncGroup = entry.syncGroup === void 0 ? void 0 : identifier(entry.syncGroup, "syncGroup");
        const datasetIds = [...records(entry.datasets ?? [], `graph "${entry.id}" datasets`)];
        if (new Set(datasetIds).size !== datasetIds.length) fail(`graph "${entry.id}" has duplicate datasets`);
        for (const id of datasetIds) {
          if (typeof id !== "string" || !this._datasets.has(id)) fail(`graph "${entry.id}" references unknown dataset "${id}"`);
        }
        const functions = /* @__PURE__ */ new Map();
        for (const fn of records(entry.functions ?? [], `graph "${entry.id}" functions`)) {
          object(fn, "function");
          unique(functions, fn.id, `function in graph "${entry.id}"`);
          if (typeof fn.fn !== "function") fail(`function "${fn.id}" fn must be callable`);
          const x = fn.x ?? entry.x;
          const y = fn.y ?? entry.y;
          this._axis(x, "function x");
          this._axis(y, "function y");
          functions.set(fn.id, {
            id: fn.id,
            label: label(fn.label, fn.id, `function "${fn.id}" label`),
            fn: fn.fn,
            x,
            y,
            color: color(fn.color, COLORS[(functions.size + datasetIds.length) % COLORS.length], "function color")
          });
        }
        this._graphs.set(entry.id, {
          id: entry.id,
          title: label(entry.title, entry.id, `graph "${entry.id}" title`),
          x: entry.x,
          y: entry.y,
          datasets: datasetIds,
          functions: [...functions.values()],
          syncGroup,
          visible: entry.visible !== false,
          domains: new Map([...this._variables].map(([id, variable]) => [id, [...variable.domain]])),
          gesture: null,
          panel: null,
          svg: null,
          checkbox: null,
          selects: null,
          axes: null,
          status: null,
          clipId: "",
          editingAxis: null,
          layout: null
        });
      }
    }
    _axis(id, name) {
      if (typeof id !== "string" || !this._variables.has(id)) fail(`${name} axis references unknown variable "${String(id)}"`);
    }
    _alive() {
      if (this._destroyed) throw new Error("GraphRenderer has been destroyed");
    }
    _graph(id) {
      const graph = this._graphs.get(id);
      if (!graph) fail(`unknown graph "${String(id)}"`);
      return graph;
    }
    _element(tag, className, text) {
      const node = this._document.createElement(tag);
      if (className) node.className = className;
      if (text !== void 0) node.textContent = text;
      return node;
    }
    _svg(tag, attributes = {}, text) {
      const node = this._document.createElementNS(SVG_NS, tag);
      for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
      if (text !== void 0) node.textContent = text;
      return node;
    }
    _listen(target, type, listener, options) {
      const handler = (event) => listener(event);
      target.addEventListener(type, handler, options);
      this._listeners.push(() => target.removeEventListener(type, handler, options));
    }
    _button(text, title, callback, className = "bmg-button") {
      const button = this._element("button", className, text);
      button.type = "button";
      button.title = title;
      button.setAttribute("aria-label", title);
      this._listen(button, "click", callback);
      return button;
    }
    _build() {
      this._root = this._element("div", "bmg-graphs");
      const toolbar = this._element("div", "bmg-toolbar");
      const sidebar = this._element("aside", "bmg-sidebar");
      sidebar.id = `${this._prefix}-menu`;
      sidebar.hidden = true;
      sidebar.setAttribute("aria-label", "Graph visibility");
      const toggle = this._button("\u2630", "Toggle graph visibility menu", () => {
        sidebar.hidden = !sidebar.hidden;
        toggle.setAttribute("aria-expanded", String(!sidebar.hidden));
      }, "bmg-menu-toggle");
      toggle.setAttribute("aria-controls", sidebar.id);
      toggle.setAttribute("aria-expanded", "false");
      toolbar.append(toggle, this._element("span", "bmg-toolbar-title", "Graphs"));
      this._listen(sidebar, "keydown", (event) => {
        if (event.key === "Escape") {
          sidebar.hidden = true;
          toggle.setAttribute("aria-expanded", "false");
          toggle.focus();
        }
      });
      const grid = this._element("div", "bmg-grid");
      this._root.append(toolbar, sidebar, grid);
      let index = 0;
      for (const graph of this._graphs.values()) {
        const menuLabel = this._element("label", "bmg-menu-item");
        const checkbox = this._element("input");
        checkbox.type = "checkbox";
        checkbox.checked = graph.visible;
        checkbox.setAttribute("aria-label", `Show ${graph.title}`);
        menuLabel.append(checkbox, this._element("span", "", graph.title));
        sidebar.append(menuLabel);
        this._listen(checkbox, "change", () => this.setVisible(graph.id, checkbox.checked));
        const panel = this._element("section", "bmg-panel");
        panel.dataset.graphId = graph.id;
        const header = this._element("div", "bmg-panel-header");
        const heading = this._element("h3", "bmg-panel-title", graph.title);
        heading.id = `${this._prefix}-title-${index}`;
        panel.setAttribute("aria-labelledby", heading.id);
        const axes = this._element("div", "bmg-axes");
        axes.hidden = true;
        const selects = {};
        for (const axis of AXES) {
          const axisLabel = this._element("label", "bmg-axis-select-label", `${axis.toUpperCase()} `);
          const select = this._element("select", "bmg-axis-select");
          select.size = Math.max(2, Math.min(6, this._variables.size));
          select.setAttribute("aria-label", `${graph.title} ${axis.toUpperCase()} axis`);
          for (const variable of this._variables.values()) {
            const option = this._element("option", "", mathLabel(variable.label));
            option.value = variable.id;
            select.append(option);
          }
          select.value = graph[axis];
          this._listen(select, "change", () => {
            this.setAxes(graph.id, axis === "x" ? select.value : graph.x, axis === "y" ? select.value : graph.y);
            this._closeAxes(graph, true);
          });
          this._listen(select, "keydown", (event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              this._closeAxes(graph, true);
            }
          });
          this._listen(select, "focusout", (event) => {
            if (!axes.contains(event.relatedTarget)) this._closeAxes(graph);
          });
          axisLabel.append(select);
          axes.append(axisLabel);
          selects[axis] = select;
        }
        const controls = this._element("div", "bmg-toolbar bmg-panel-toolbar");
        controls.append(
          this._button("+", "Zoom in", () => this._zoom(graph, 0.8)),
          this._button("-", "Zoom out", () => this._zoom(graph, 1.25)),
          this._button("Reset", "Reset plot view", () => this.reset(graph.id))
        );
        header.append(heading, controls);
        const svg = this._svg("svg", {
          class: "bmg-surface",
          width: "100%",
          height: 360,
          tabindex: 0,
          role: "group",
          "aria-label": `${graph.title} interactive plot`
        });
        svg.style.display = "block";
        svg.style.width = "100%";
        svg.style.touchAction = "none";
        const legend = this._element("div", "bmg-legend");
        for (const id of graph.datasets) {
          const dataset = this._datasets.get(id);
          const item = this._element("span", "bmg-legend-item", dataset.label);
          item.style.color = dataset.color;
          legend.append(item);
        }
        for (const fn of graph.functions) {
          const item = this._element("span", "bmg-legend-item bmg-math-label", mathLabel(fn.label));
          item.style.color = fn.color;
          legend.append(item);
        }
        const status = this._element("div", "bmg-status");
        status.id = `${this._prefix}-status-${index}`;
        status.setAttribute("role", "status");
        status.setAttribute("aria-live", "polite");
        graph.panel = panel;
        graph.svg = svg;
        graph.checkbox = checkbox;
        graph.selects = selects;
        graph.axes = axes;
        graph.status = status;
        graph.clipId = `${this._prefix}-clip-${index++}`;
        panel.append(header, svg, axes, legend, status);
        grid.append(panel);
        this._listen(svg, "pointerdown", (event) => this._pointerStart(graph, event));
        this._listen(svg, "lostpointercapture", (event) => this._pointerEnd(event));
        this._listen(svg, "wheel", (event) => {
          event.preventDefault();
          const position = this._position(graph, event);
          if (!this._inside(graph, position)) return;
          const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? graph.layout.height : 1;
          const factor = Math.exp(Math.max(-1, Math.min(1, event.deltaY * unit * 2e-3)));
          this._zoom(graph, factor, position);
        }, { passive: false });
        this._listen(svg, "keydown", (event) => this._key(graph, event));
        this._listen(svg, "click", (event) => {
          const axis = event.target?.closest?.("[data-axis]")?.getAttribute("data-axis");
          if (axis === "x" || axis === "y") this._openAxis(graph, axis);
        });
      }
    }
    _closeAxes(graph, focus = false) {
      for (const candidate of graph ? [graph] : this._graphs.values()) {
        candidate.axes.hidden = true;
        candidate.svg.querySelectorAll("[data-axis]").forEach((el) => el.setAttribute("aria-expanded", "false"));
        if (focus && candidate.editingAxis) candidate.svg.querySelector(`[data-axis="${candidate.editingAxis}"]`)?.focus({ preventScroll: true });
        candidate.editingAxis = null;
      }
    }
    _openAxis(graph, axis) {
      this._closeAxes();
      const label2 = graph.svg.querySelector(`[data-axis="${axis}"]`);
      const rect = label2.getBoundingClientRect();
      const panel = graph.panel.getBoundingClientRect();
      graph.editingAxis = axis;
      graph.axes.hidden = false;
      for (const key of AXES) graph.selects[key].parentElement.hidden = key !== axis;
      graph.axes.style.left = `${Math.max(4, Math.min(panel.width - 140, rect.left - panel.left))}px`;
      graph.axes.style.top = `${Math.max(4, rect.top - panel.top - graph.axes.offsetHeight - 5)}px`;
      label2.setAttribute("aria-expanded", "true");
      graph.selects[axis].focus({ preventScroll: true });
    }
    _render() {
      if (this._destroyed) return;
      for (const graph of this._graphs.values()) {
        graph.panel.hidden = !graph.visible;
        graph.checkbox.checked = graph.visible;
        graph.selects.x.value = graph.x;
        graph.selects.y.value = graph.y;
        if (graph.visible) this._draw(graph);
      }
    }
    _draw(graph) {
      const svg = graph.svg;
      const bounds = svg.getBoundingClientRect();
      const width = Math.max(160, bounds.width || graph.panel.clientWidth || 640);
      const height = Math.max(120, bounds.height || 360);
      const layout = { width, height, left: 58, right: width - 20, top: 18, bottom: height - 48, plotWidth: width - 78, plotHeight: height - 66 };
      graph.layout = layout;
      const xd = graph.domains.get(graph.x);
      const yd = graph.domains.get(graph.y);
      const sx = (x) => layout.left + (x - xd[0]) / (xd[1] - xd[0]) * layout.plotWidth;
      const sy = (y) => layout.bottom - (y - yd[0]) / (yd[1] - yd[0]) * layout.plotHeight;
      svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
      const active = this._document.activeElement;
      const focusedPoint = active && svg.contains(active) && active.hasAttribute("data-bmg-point") ? { dataset: active.getAttribute("data-dataset-id"), point: active.getAttribute("data-point-id") } : null;
      const fragment = this._document.createDocumentFragment();
      const defs = this._svg("defs");
      const clip = this._svg("clipPath", { id: graph.clipId });
      clip.append(this._svg("rect", {
        x: layout.left,
        y: layout.top,
        width: layout.plotWidth,
        height: layout.plotHeight
      }));
      defs.append(clip);
      fragment.append(defs, this._svg("rect", {
        class: "bmg-plot-background",
        x: layout.left,
        y: layout.top,
        width: layout.plotWidth,
        height: layout.plotHeight,
        fill: "transparent"
      }));
      const grid = this._svg("g", { class: "bmg-gridlines", "aria-hidden": "true" });
      for (const x of ticks(xd, Math.max(2, Math.floor(layout.plotWidth / 85)))) {
        const px = sx(x);
        grid.append(this._svg("line", {
          class: `bmg-gridline${x === 0 ? " bmg-zero-line" : ""}`,
          x1: px,
          y1: layout.top,
          x2: px,
          y2: layout.bottom,
          stroke: x === 0 ? "#94a3b8" : "#e2e8f0",
          "vector-effect": "non-scaling-stroke"
        }), this._svg("text", {
          class: "bmg-tick-label",
          x: px,
          y: layout.bottom + 19,
          "text-anchor": "middle",
          fill: "currentColor",
          "font-size": 11
        }, numberLabel(x)));
      }
      for (const y of ticks(yd, Math.max(2, Math.floor(layout.plotHeight / 55)))) {
        const py = sy(y);
        grid.append(this._svg("line", {
          class: `bmg-gridline${y === 0 ? " bmg-zero-line" : ""}`,
          x1: layout.left,
          y1: py,
          x2: layout.right,
          y2: py,
          stroke: y === 0 ? "#94a3b8" : "#e2e8f0",
          "vector-effect": "non-scaling-stroke"
        }), this._svg("text", {
          class: "bmg-tick-label",
          x: layout.left - 8,
          y: py + 4,
          "text-anchor": "end",
          fill: "currentColor",
          "font-size": 11
        }, numberLabel(y)));
      }
      fragment.append(grid);
      const axisX = Math.max(layout.left, Math.min(layout.right, sx(0)));
      const axisY = Math.max(layout.top, Math.min(layout.bottom, sy(0)));
      fragment.append(this._svg("line", {
        class: "bmg-axis-line bmg-x-axis",
        x1: layout.left,
        x2: layout.right,
        y1: axisY,
        y2: axisY,
        "aria-hidden": "true"
      }), this._svg("line", {
        class: "bmg-axis-line bmg-y-axis",
        x1: axisX,
        x2: axisX,
        y1: layout.top,
        y2: layout.bottom,
        "aria-hidden": "true"
      }));
      fragment.append(this._svg("text", {
        class: "bmg-axis-label",
        x: (layout.left + layout.right) / 2,
        y: height - 8,
        "text-anchor": "middle",
        fill: "currentColor",
        "font-size": 13,
        "data-axis": "x",
        tabindex: 0,
        role: "button",
        "aria-haspopup": "listbox",
        "aria-expanded": String(graph.editingAxis === "x"),
        "aria-label": `Change X axis: ${this._variables.get(graph.x).label}`
      }, mathLabel(this._variables.get(graph.x).label)));
      fragment.append(this._svg("text", {
        class: "bmg-axis-label",
        transform: `translate(14 ${(layout.top + layout.bottom) / 2}) rotate(-90)`,
        "text-anchor": "middle",
        fill: "currentColor",
        "font-size": 13,
        "data-axis": "y",
        tabindex: 0,
        role: "button",
        "aria-haspopup": "listbox",
        "aria-expanded": String(graph.editingAxis === "y"),
        "aria-label": `Change Y axis: ${this._variables.get(graph.y).label}`
      }, mathLabel(this._variables.get(graph.y).label)));
      const curves = this._svg("g", { "clip-path": `url(#${graph.clipId})` });
      for (const fn of graph.functions) {
        const forward = fn.x === graph.x && fn.y === graph.y;
        const reversed = fn.x === graph.y && fn.y === graph.x;
        if (!forward && !reversed) continue;
        const path = this._svg("path", {
          class: "bmg-curve",
          d: forward ? this._sample(fn.fn, xd, sx, sy, layout) : this._sample(fn.fn, yd, sy, sx, layout, true),
          fill: "none",
          stroke: fn.color,
          "stroke-width": 2,
          "vector-effect": "non-scaling-stroke",
          "data-function-id": fn.id,
          "pointer-events": "none"
        });
        path.append(this._svg("title", {}, fn.label));
        curves.append(path);
      }
      fragment.append(curves);
      const points = this._svg("g", { "clip-path": `url(#${graph.clipId})` });
      let focusTarget;
      for (const id of graph.datasets) {
        const dataset = this._datasets.get(id);
        for (const point of dataset.points.values()) {
          const x = point.values[graph.x];
          const y = point.values[graph.y];
          if (!Number.isFinite(x) || !Number.isFinite(y) || x < xd[0] || x > xd[1] || y < yd[0] || y > yd[1]) continue;
          const node = this._svg("circle", {
            class: "bmg-point",
            cx: sx(x),
            cy: sy(y),
            r: 6,
            fill: dataset.color,
            stroke: "white",
            "stroke-width": 1.5,
            tabindex: 0,
            role: "button",
            "data-bmg-point": "",
            "data-dataset-id": id,
            "data-point-id": point.id,
            "aria-label": `${dataset.label}, ${point.id}: ${graph.x} ${numberLabel(x)}, ${graph.y} ${numberLabel(y)}. Arrow keys move point.`
          });
          node.style.cursor = "grab";
          node.append(this._svg("title", {}, `${dataset.label}: ${point.id}`));
          points.append(node);
          if (focusedPoint?.dataset === id && focusedPoint.point === point.id) focusTarget = node;
        }
      }
      fragment.append(points);
      svg.replaceChildren(fragment);
      if (focusedPoint) (focusTarget || svg).focus({ preventScroll: true });
    }
    _sample(fn, [min, max], sx, sy, layout, reversed = false) {
      const cache = /* @__PURE__ */ new Map();
      let budget = 6e3;
      let path = "";
      let last = null;
      const sample = (x) => {
        if (cache.has(x)) return cache.get(x);
        if (budget-- <= 0) return null;
        let y;
        try {
          y = fn(x);
        } catch {
          y = NaN;
        }
        const py = Number.isFinite(y) ? sy(y) : NaN;
        const point = Number.isFinite(py) && Math.abs(py) < 1e12 ? [sx(x), py] : null;
        cache.set(x, point);
        return point;
      };
      const segment = (a2, b, pa2, pb, depth) => {
        if (budget <= 0) {
          last = null;
          return;
        }
        const midpoint = a2 + (b - a2) / 2;
        const pm = sample(midpoint);
        const valid = pa2 && pb && pm;
        const error = valid ? Math.abs(pm[1] - (pa2[1] / 2 + pb[1] / 2)) : Infinity;
        const jump = valid ? Math.abs(pa2[1] - pb[1]) : Infinity;
        const refine = !valid || error > 0.8 || jump > layout.plotHeight;
        if (refine && depth < 11 && midpoint > a2 && midpoint < b) {
          if (!pa2 && !pb && !pm && depth >= 3) {
            last = null;
            return;
          }
          segment(a2, midpoint, pa2, pm, depth + 1);
          segment(midpoint, b, pm, pb, depth + 1);
          return;
        }
        if (!valid || error > 4 || jump > layout.plotHeight * 1.5) {
          last = null;
          return;
        }
        const encode = (point) => reversed ? `${point[1].toFixed(3)},${point[0].toFixed(3)}` : `${point[0].toFixed(3)},${point[1].toFixed(3)}`;
        if (last !== pa2) path += `M${encode(pa2)}`;
        path += `L${encode(pb)}`;
        last = pb;
      };
      const count = Math.max(32, Math.min(160, Math.ceil(layout.plotWidth / 10)));
      let a = min;
      let pa = sample(a);
      for (let i = 1; i <= count && budget > 0; i += 1) {
        const b = i === count ? max : min + (max - min) * (i / count);
        const pb = sample(b);
        segment(a, b, pa, pb, 0);
        a = b;
        pa = pb;
      }
      return path;
    }
    _position(graph, event) {
      const rect = graph.svg.getBoundingClientRect();
      return {
        x: (event.clientX - rect.left) * graph.layout.width / (rect.width || graph.layout.width),
        y: (event.clientY - rect.top) * graph.layout.height / (rect.height || graph.layout.height)
      };
    }
    _inside(graph, point) {
      const l = graph.layout;
      return point.x >= l.left && point.x <= l.right && point.y >= l.top && point.y <= l.bottom;
    }
    _coordinate(graph, position) {
      const xd = graph.domains.get(graph.x);
      const yd = graph.domains.get(graph.y);
      const l = graph.layout;
      return {
        x: xd[0] + (position.x - l.left) / l.plotWidth * (xd[1] - xd[0]),
        y: yd[0] + (l.bottom - position.y) / l.plotHeight * (yd[1] - yd[0])
      };
    }
    _pointTarget(graph, target) {
      const node = target?.closest?.("[data-bmg-point]");
      if (!node || !graph.svg.contains(node)) return null;
      return { datasetId: node.getAttribute("data-dataset-id"), pointId: node.getAttribute("data-point-id"), node };
    }
    _pointerStart(graph, event) {
      if (event.target?.closest?.("[data-axis]")) return;
      this._closeAxes();
      if (event.button !== void 0 && event.button !== 0) return;
      const position = this._position(graph, event);
      const point = this._pointTarget(graph, event.target);
      if (!point && !this._inside(graph, position)) return;
      event.preventDefault();
      this._pointers.set(event.pointerId, graph);
      if (!graph.gesture) graph.gesture = { pointers: /* @__PURE__ */ new Map(), point, origin: position, distance: 0, domains: /* @__PURE__ */ new Map() };
      graph.gesture.pointers.set(event.pointerId, position);
      if (graph.gesture.pointers.size > 1) graph.gesture.point = null;
      this._gestureBase(graph);
      (point?.node || graph.svg).focus({ preventScroll: true });
      try {
        graph.svg.setPointerCapture(event.pointerId);
      } catch {
      }
    }
    _gestureBase(graph) {
      const gesture = graph.gesture;
      const positions = [...gesture.pointers.values()];
      const a = positions[0];
      const b = positions[1];
      gesture.origin = b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : { ...a };
      gesture.distance = b ? Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)) : 0;
      gesture.domains = new Map([...graph.domains].map(([id, values]) => [id, [...values]]));
    }
    _pointerMove(event) {
      const graph = this._pointers.get(event.pointerId);
      if (!graph || !graph.gesture || !graph.visible) return;
      event.preventDefault();
      const gesture = graph.gesture;
      const position = this._position(graph, event);
      gesture.pointers.set(event.pointerId, position);
      if (gesture.point && gesture.pointers.size === 1) {
        const values = this._coordinate(graph, position);
        if (!Number.isFinite(values.x) || !Number.isFinite(values.y)) return;
        const patch = { [graph.x]: values.x };
        if (graph.y !== graph.x) patch[graph.y] = values.y;
        this.setPoint(gesture.point.datasetId, gesture.point.pointId, patch);
        return;
      }
      const [a, b] = [...gesture.pointers.values()];
      const center = b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : a;
      const factor = b ? gesture.distance / Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)) : 1;
      const l = graph.layout;
      const changes = /* @__PURE__ */ new Map();
      for (const axis of AXES) {
        const variable = graph[axis];
        if (changes.has(variable)) continue;
        const old = gesture.domains.get(variable);
        const span = old[1] - old[0];
        const originalRatio = axis === "x" ? (gesture.origin.x - l.left) / l.plotWidth : (l.bottom - gesture.origin.y) / l.plotHeight;
        const currentRatio = axis === "x" ? (center.x - l.left) / l.plotWidth : (l.bottom - center.y) / l.plotHeight;
        const anchor = old[0] + originalRatio * span;
        const nextMin = anchor - currentRatio * span * factor;
        changes.set(variable, [nextMin, nextMin + span * factor]);
      }
      this._view(graph, changes);
    }
    _pointerEnd(event) {
      const graph = this._pointers.get(event.pointerId);
      if (!graph) return;
      this._pointers.delete(event.pointerId);
      const gesture = graph.gesture;
      if (gesture) {
        gesture.pointers.delete(event.pointerId);
        if (!gesture.pointers.size) graph.gesture = null;
        else {
          gesture.point = null;
          this._gestureBase(graph);
        }
      }
      try {
        if (graph.svg.hasPointerCapture(event.pointerId)) graph.svg.releasePointerCapture(event.pointerId);
      } catch {
      }
    }
    _cancelGesture(graph) {
      for (const [id, owner] of this._pointers) {
        if (owner === graph) this._pointerEnd({ pointerId: id });
      }
      graph.gesture = null;
    }
    _zoom(graph, factor, position) {
      const l = graph.layout;
      if (!l) return;
      const anchor = this._coordinate(graph, position || { x: (l.left + l.right) / 2, y: (l.top + l.bottom) / 2 });
      const changes = /* @__PURE__ */ new Map();
      for (const axis of AXES) {
        const variable = graph[axis];
        if (changes.has(variable)) continue;
        const old = graph.domains.get(variable);
        changes.set(variable, old.map((value) => anchor[axis] + (value - anchor[axis]) * factor));
      }
      this._view(graph, changes);
    }
    _validView(values) {
      const [min, max] = values;
      const span = max - min;
      return Number.isFinite(min) && Number.isFinite(max) && Number.isFinite(span) && span > 0 && span > Math.max(Math.abs(min), Math.abs(max)) * Number.EPSILON * 8;
    }
    _assignDomains(graph, changes) {
      let changed = false;
      for (const candidate of this._graphs.values()) {
        if (candidate !== graph && (graph.syncGroup === void 0 || candidate.syncGroup !== graph.syncGroup)) continue;
        for (const [variable, values] of changes) {
          const old = candidate.domains.get(variable);
          if (old[0] !== values[0] || old[1] !== values[1]) {
            candidate.domains.set(variable, [...values]);
            changed = true;
          }
        }
      }
      return changed;
    }
    _view(graph, changes) {
      if (![...changes.values()].every((values) => this._validView(values))) return;
      if (this._assignDomains(graph, changes)) this._changed({ type: "view", graphId: graph.id });
    }
    _key(graph, event) {
      const axis = event.target?.getAttribute?.("data-axis");
      if (axis) {
        if ((axis === "x" || axis === "y") && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          this._openAxis(graph, axis);
        }
        return;
      }
      if (event.ctrlKey || event.metaKey) return;
      const arrows = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];
      const pointTarget = this._pointTarget(graph, event.target);
      if (pointTarget && arrows.includes(event.key)) {
        event.preventDefault();
        event.stopPropagation();
        const horizontal = event.key === "ArrowLeft" || event.key === "ArrowRight";
        const variable = graph[horizontal ? "x" : "y"];
        const range = graph.domains.get(variable);
        const direction = event.key === "ArrowLeft" || event.key === "ArrowDown" ? -1 : 1;
        const scale = event.shiftKey ? 0.1 : event.altKey ? 1e-3 : 0.01;
        const point = this._datasets.get(pointTarget.datasetId).points.get(pointTarget.pointId);
        const value = point.values[variable] + (range[1] - range[0]) * scale * direction;
        if (Number.isFinite(value)) this.setPoint(pointTarget.datasetId, pointTarget.pointId, { [variable]: value });
        return;
      }
      if (arrows.includes(event.key)) {
        event.preventDefault();
        const horizontal = event.key === "ArrowLeft" || event.key === "ArrowRight";
        const variable = graph[horizontal ? "x" : "y"];
        const old = graph.domains.get(variable);
        const direction = event.key === "ArrowLeft" || event.key === "ArrowDown" ? -1 : 1;
        const delta = (old[1] - old[0]) * (event.shiftKey ? 0.5 : 0.1) * direction;
        this._view(graph, /* @__PURE__ */ new Map([[variable, old.map((value) => value + delta)]]));
      } else if (["+", "=", "-", "_"].includes(event.key)) {
        event.preventDefault();
        this._zoom(graph, event.key === "+" || event.key === "=" ? 0.8 : 1.25);
      } else if (event.key === "Home" || event.key === "0") {
        event.preventDefault();
        this.reset(graph.id);
      }
    }
    _changed(change) {
      this._render();
      if (change.type === "point") {
        const point = this._datasets.get(change.datasetId).points.get(change.pointId);
        for (const graph of this._graphs.values()) {
          if (!graph.datasets.includes(change.datasetId)) continue;
          graph.status.textContent = `${change.pointId}: ${Object.entries(point.values).map(([id, value]) => `${id} = ${numberLabel(value)}`).join(", ")}`;
        }
      }
      if (this._onChange) this._onChange(this.getState(), { ...change });
    }
    /** Returns detached arrays/objects; function callbacks remain callable references. */
    getState() {
      return {
        variables: [...this._variables.values()].map((variable) => ({ ...variable, domain: [...variable.domain] })),
        datasets: [...this._datasets.values()].map((dataset) => ({
          id: dataset.id,
          label: dataset.label,
          color: dataset.color,
          points: [...dataset.points.values()].map((point) => ({ id: point.id, values: { ...point.values } }))
        })),
        graphs: [...this._graphs.values()].map((graph) => ({
          id: graph.id,
          title: graph.title,
          x: graph.x,
          y: graph.y,
          datasets: [...graph.datasets],
          functions: graph.functions.map((fn) => ({ ...fn })),
          syncGroup: graph.syncGroup,
          visible: graph.visible,
          domains: Object.fromEntries([...graph.domains].map(([id, values]) => [id, [...values]])),
          view: { x: [...graph.domains.get(graph.x)], y: [...graph.domains.get(graph.y)] }
        }))
      };
    }
    /** Merges finite values for known variables; omitted coordinates are preserved. */
    setPoint(datasetId, pointId, values) {
      this._alive();
      const dataset = this._datasets.get(datasetId);
      if (!dataset) fail(`unknown dataset "${String(datasetId)}"`);
      const point = dataset.points.get(pointId);
      if (!point) fail(`unknown point "${String(pointId)}" in dataset "${datasetId}"`);
      const patch = pointValues(values, this._variables, `point "${pointId}" values`);
      if (!Object.entries(patch).some(([id, value]) => point.values[id] !== value)) return this;
      Object.assign(point.values, patch);
      this._changed({ type: "point", datasetId, pointId });
      return this;
    }
    setAxes(graphId, x, y) {
      this._alive();
      const graph = this._graph(graphId);
      this._axis(x, "x");
      this._axis(y, "y");
      if (graph.x === x && graph.y === y) return this;
      this._cancelGesture(graph);
      graph.x = x;
      graph.y = y;
      this._changed({ type: "axes", graphId, x, y });
      return this;
    }
    setVisible(graphId, visible) {
      this._alive();
      const graph = this._graph(graphId);
      if (typeof visible !== "boolean") fail("visible must be boolean");
      if (graph.visible === visible) return this;
      this._cancelGesture(graph);
      this._closeAxes(graph);
      graph.visible = visible;
      this._changed({ type: "visibility", graphId, visible });
      return this;
    }
    /** Restores variable domains, not dataset values. Linked graphs reset together. */
    reset(graphId) {
      this._alive();
      const graphs = graphId === void 0 ? [...this._graphs.values()] : [this._graph(graphId)];
      const changes = new Map([...this._variables].map(([id, variable]) => [id, [...variable.domain]]));
      let changed = false;
      for (const graph of graphs) {
        this._cancelGesture(graph);
        changed = this._assignDomains(graph, changes) || changed;
      }
      if (changed) this._changed({ type: "reset", graphId });
      return this;
    }
    destroy() {
      if (this._destroyed) return;
      for (const graph of this._graphs.values()) this._cancelGesture(graph);
      this._destroyed = true;
      this._observer?.disconnect();
      for (const remove of this._listeners.splice(0)) remove();
      this._root.remove();
      this._pointers.clear();
      for (const graph of this._graphs.values()) {
        graph.svg = graph.panel = graph.checkbox = graph.selects = graph.status = graph.axes = null;
      }
      this._root = this._container = this._document = this._observer = this._onChange = null;
    }
  };

  // vendor/textip/src/index.ts
  function getMathJax() {
    return globalThis.MathJax;
  }
  var instance = 0;
  function group(source, start, tex = true) {
    if (source[start] !== "{") throw new SyntaxError(`Expected { at ${start}`);
    let depth = 1;
    for (let i = start + 1; i < source.length; i++) {
      if (source[i] === "\\") {
        i++;
        continue;
      }
      if (tex && source[i] === "%") {
        const end = source.indexOf("\n", i);
        if (end < 0) break;
        i = end;
        continue;
      }
      if (source[i] === "{") depth++;
      if (source[i] === "}" && --depth === 0) {
        return { content: source.slice(start + 1, i), end: i + 1 };
      }
    }
    throw new SyntaxError(`Unclosed tooltip group at ${start}`);
  }
  function transformTooltips(source, register, registerGroup) {
    let result = "";
    for (let i = 0; i < source.length; ) {
      const verb = /^\\verb\*?([^a-zA-Z\s])/.exec(source.slice(i));
      if (verb) {
        const end = source.indexOf(verb[1], i + verb[0].length);
        if (end < 0) return result + source.slice(i);
        result += source.slice(i, end + 1);
        i = end + 1;
        continue;
      }
      const match = /^\\(tooltipAnchor|tta|tooltipConnect|ttc|tooltip|ttip)\s*(?=\{)/.exec(source.slice(i));
      if (!match && source[i] === "\\") {
        result += source.slice(i, i + 2);
        i += 2;
        continue;
      }
      if (source[i] === "%") {
        const end = source.indexOf("\n", i);
        if (end < 0) return result + source.slice(i);
        result += source.slice(i, end + 1);
        i = end + 1;
        continue;
      }
      if (!match) {
        result += source[i++];
        continue;
      }
      const equation = group(source, i + match[0].length);
      let next = equation.end;
      while (/\s/.test(source[next] ?? "") && next < source.length) next++;
      const argument = group(source, next, false);
      const isGroup = !["tooltip", "ttip"].includes(match[1]);
      const kind = ["tooltipAnchor", "tta"].includes(match[1]) ? "anchor" : "connect";
      if (isGroup && !argument.content.trim()) throw new SyntaxError("Tooltip identifier must not be empty");
      if (isGroup && !registerGroup) throw new TypeError("A group registrar is required for Anchor/Connect markup");
      const key = isGroup ? registerGroup(argument.content, kind) : register(argument.content);
      result += `\\class{${key}}{${transformTooltips(equation.content, register, registerGroup)}}`;
      i = argument.end;
    }
    return result;
  }
  function createMathTooltips(options = {}) {
    const prefix = `bmg-tip-${++instance}-`;
    const entries = /* @__PURE__ */ new Map();
    const keys = /* @__PURE__ */ new Map();
    const groups = /* @__PURE__ */ new Map();
    const groupKeys = /* @__PURE__ */ new Map();
    const base = options.mathJax ?? {};
    let count = 0;
    const register = (text) => {
      if (keys.has(text)) return keys.get(text);
      const key = `${prefix}${++count}`;
      entries.set(key, text);
      keys.set(text, key);
      return key;
    };
    const registerGroup = (identifier2, kind) => {
      const token = JSON.stringify([identifier2, kind]);
      if (groupKeys.has(token)) return groupKeys.get(token);
      const key = `${prefix}group-${++count}`;
      groups.set(key, { identifier: identifier2, kind });
      groupKeys.set(token, key);
      return key;
    };
    const packages = base.tex?.packages;
    const config = {
      ...base,
      loader: { ...base.loader, load: [.../* @__PURE__ */ new Set([...base.loader?.load ?? [], "[tex]/html"])] },
      tex: {
        ...base.tex,
        packages: Array.isArray(packages) ? [.../* @__PURE__ */ new Set([...packages, "html"])] : { ...packages, "[+]": [.../* @__PURE__ */ new Set([...packages?.["[+]"] ?? [], "html"])] }
      },
      startup: {
        ...base.startup,
        ready() {
          const mathJax = getMathJax();
          if (base.startup?.ready) base.startup.ready();
          else mathJax.startup.defaultReady();
          for (const input of mathJax.startup.document.inputJax) {
            if (input.name === "TeX") {
              input.preFilters.add(({ math }) => {
                math.math = transformTooltips(math.math, register, registerGroup);
              });
            }
          }
        }
      }
    };
    let cleanup;
    function attach(root = document.body) {
      cleanup?.();
      const doc = root.ownerDocument;
      const win = doc.defaultView;
      if (!win) throw new Error("Tooltip root must belong to a document with a window");
      const tip = doc.createElement("div");
      tip.id = `${prefix}popup`;
      tip.className = "bmg-tooltip";
      tip.setAttribute("role", "tooltip");
      tip.hidden = true;
      const borders = doc.createElement("div");
      borders.className = "bmg-math-borders";
      borders.setAttribute("aria-hidden", "true");
      doc.body.append(tip, borders);
      let active;
      let renderVersion = 0;
      const rendered = /* @__PURE__ */ new Map();
      let conversions = Promise.resolve();
      const highlighted = /* @__PURE__ */ new Set();
      const decorated = /* @__PURE__ */ new Map();
      const abort = new win.AbortController();
      const listen = (node, name, handler, extra = {}) => node.addEventListener(name, handler, { signal: abort.signal, ...extra });
      const keyFor = (element) => [...element.classList].find((key) => entries.has(key));
      const relationsFor = (element) => [...element.classList].filter((key) => groups.has(key));
      const localText = (element) => {
        const key = keyFor(element) || [...element.querySelectorAll("[class]")].filter((el) => !el.closest("mjx-assistive-mml")).map(keyFor).find(Boolean);
        return key ? entries.get(key) : void 0;
      };
      const textFor = (element) => {
        const own = localText(element);
        if (own !== void 0) return own;
        const scope = element.closest("mjx-container");
        if (!scope) return void 0;
        const ids = relationsFor(element).map((key) => groups.get(key).identifier);
        for (const candidate of scope.querySelectorAll("[class]")) {
          if (candidate.closest("mjx-assistive-mml")) continue;
          if (!relationsFor(candidate).some((key) => {
            const relation = groups.get(key);
            return relation.kind === "anchor" && ids.includes(relation.identifier);
          })) continue;
          const text = localText(candidate);
          if (text !== void 0) return text;
        }
        return void 0;
      };
      const positionBorders = () => {
        for (const [el, attributes] of decorated) {
          const rect = el.getBoundingClientRect();
          const border = attributes.border;
          let left = rect.left - 2;
          let right = rect.right + 2;
          let top = rect.top - 2;
          let bottom = rect.bottom + 2;
          for (let parent = el.parentElement; parent; parent = parent.parentElement) {
            const style = win.getComputedStyle(parent);
            const bounds = parent.getBoundingClientRect();
            if (["hidden", "clip", "auto", "scroll"].includes(style.overflowX)) {
              left = Math.max(left, bounds.left);
              right = Math.min(right, bounds.right);
            }
            if (["hidden", "clip", "auto", "scroll"].includes(style.overflowY)) {
              top = Math.max(top, bounds.top);
              bottom = Math.min(bottom, bounds.bottom);
            }
          }
          border.hidden = !el.isConnected || !rect.width || !rect.height || right <= left || bottom <= top;
          border.style.left = `${left + win.scrollX}px`;
          border.style.top = `${top + win.scrollY}px`;
          border.style.width = `${Math.max(0, right - left)}px`;
          border.style.height = `${Math.max(0, bottom - top)}px`;
          border.classList.toggle("bmg-math-border-active", highlighted.has(el));
        }
      };
      let frame;
      const scheduleBorders = () => {
        if (frame !== void 0) return;
        frame = win.requestAnimationFrame(() => {
          frame = void 0;
          positionBorders();
        });
      };
      const anchorFor = (node) => {
        for (let el = node instanceof win.Element ? node : null; el && root.contains(el); el = el.parentElement) {
          if (keyFor(el) || relationsFor(el).length) return el;
        }
        return null;
      };
      const hide = () => {
        renderVersion++;
        active?.removeAttribute("aria-describedby");
        for (const el of highlighted) el.classList.remove("bmg-math-active");
        highlighted.clear();
        active = null;
        tip.hidden = true;
        positionBorders();
      };
      const show = (anchor) => {
        if (!anchor) return hide();
        hide();
        active = anchor;
        const scope = anchor.closest("mjx-container");
        const identifiers = /* @__PURE__ */ new Set();
        for (let el = anchor; el && el !== scope; el = el.parentElement) {
          for (const key of relationsFor(el)) identifiers.add(groups.get(key).identifier);
        }
        highlighted.add(anchor);
        if (scope && identifiers.size) {
          scope.querySelectorAll("[class]").forEach((el) => {
            if (!el.closest("mjx-assistive-mml") && relationsFor(el).some((key) => identifiers.has(groups.get(key).identifier))) highlighted.add(el);
          });
        }
        for (const el of highlighted) el.classList.add("bmg-math-active");
        positionBorders();
        const text = textFor(anchor);
        if (text === void 0) return;
        tip.textContent = text;
        tip.hidden = false;
        anchor.setAttribute("aria-describedby", tip.id);
        const a = anchor.getBoundingClientRect();
        const t = tip.getBoundingClientRect();
        tip.style.left = `${Math.max(8, Math.min(win.innerWidth - t.width - 8, a.left + a.width / 2 - t.width / 2))}px`;
        tip.style.top = `${Math.max(8, Math.min(win.innerHeight - t.height - 8, a.top >= t.height + 16 ? a.top - t.height - 8 : a.bottom + 8))}px`;
        const version = renderVersion;
        if (!rendered.has(text)) {
          const job = conversions.then(async () => {
            const fragment = doc.createDocumentFragment();
            const pattern = /\\\$([\s\S]*?)\\\$|\$((?:\\[\s\S]|[^$])+)\$|\\\(([\s\S]*?)\\\)/g;
            let offset = 0;
            for (const match of text.matchAll(pattern)) {
              fragment.append(doc.createTextNode(text.slice(offset, match.index)));
              const source = match[1] ?? match[2] ?? match[3];
              const mathJax = getMathJax();
              const svg = mathJax.startup.document.outputJax.name === "SVG";
              try {
                const node = await (svg ? mathJax.tex2svgPromise(source, { display: false }) : mathJax.tex2chtmlPromise(source, { display: false }));
                fragment.append(node);
              } catch {
                fragment.append(doc.createTextNode(match[0]));
              }
              offset = match.index + match[0].length;
            }
            fragment.append(doc.createTextNode(text.slice(offset)));
            return fragment;
          });
          rendered.set(text, job);
          conversions = job.catch(() => {
          });
        }
        rendered.get(text).then((fragment) => {
          if (abort.signal.aborted || version !== renderVersion || active !== anchor) return;
          tip.replaceChildren(fragment.cloneNode(true));
          const bounds = tip.getBoundingClientRect();
          const target = anchor.getBoundingClientRect();
          tip.style.left = `${Math.max(8, Math.min(win.innerWidth - bounds.width - 8, target.left + target.width / 2 - bounds.width / 2))}px`;
          tip.style.top = `${Math.max(8, Math.min(win.innerHeight - bounds.height - 8, target.top >= bounds.height + 16 ? target.top - bounds.height - 8 : target.bottom + 8))}px`;
        }).catch(() => {
        });
      };
      const decorate = () => {
        root.querySelectorAll("[class]").forEach((el) => {
          if (tip.contains(el)) return;
          if (el.closest("mjx-assistive-mml")) return;
          const key = keyFor(el);
          const relations = relationsFor(el);
          if (!key && !relations.length) return;
          if (!decorated.has(el)) {
            const border = doc.createElement("span");
            border.className = "bmg-math-border";
            borders.append(border);
            decorated.set(el, {
              tabindex: el.getAttribute("tabindex"),
              label: el.getAttribute("aria-label"),
              describedby: el.getAttribute("aria-describedby"),
              border
            });
            resizeObserver.observe(el.closest("mjx-container") || el);
          }
          el.setAttribute("tabindex", "0");
          const text = textFor(el);
          if (text !== void 0) el.setAttribute("aria-label", text);
          el.classList.add("bmg-math-term");
        });
        for (const [el, attributes] of decorated) {
          if (!root.contains(el)) {
            attributes.border.remove();
            decorated.delete(el);
          }
        }
        scheduleBorders();
      };
      listen(root, "pointerover", (e) => show(anchorFor(e.target)));
      listen(root, "pointerout", (e) => show(anchorFor(e.relatedTarget)));
      listen(root, "focusin", (e) => show(anchorFor(e.target)));
      listen(root, "focusout", (e) => show(anchorFor(e.relatedTarget)));
      listen(root, "click", (e) => show(anchorFor(e.target)));
      listen(doc, "pointerdown", (e) => {
        if (!anchorFor(e.target)) hide();
      });
      listen(doc, "keydown", (e) => {
        if (e.key === "Escape") hide();
        if ((e.key === "Enter" || e.key === " ") && anchorFor(e.target)) {
          e.preventDefault();
          show(anchorFor(e.target));
        }
      });
      listen(win, "scroll", () => {
        if (active) show(active);
        scheduleBorders();
      }, { capture: true });
      listen(win, "resize", () => {
        hide();
        scheduleBorders();
      });
      const resizeObserver = new win.ResizeObserver(scheduleBorders);
      resizeObserver.observe(root);
      listen(doc, "load", scheduleBorders, { capture: true });
      doc.fonts?.ready.then(() => {
        if (!abort.signal.aborted) scheduleBorders();
      });
      if (doc.fonts) listen(doc.fonts, "loadingdone", scheduleBorders);
      const observer = new win.MutationObserver((records2) => {
        if (records2.some((record) => record.type === "childList" && !tip.contains(record.target) && !borders.contains(record.target))) {
          if (active && !root.contains(active)) hide();
          decorate();
        }
      });
      observer.observe(root, { childList: true, subtree: true });
      decorate();
      cleanup = () => {
        hide();
        abort.abort();
        observer.disconnect();
        resizeObserver.disconnect();
        if (frame !== void 0) win.cancelAnimationFrame(frame);
        tip.remove();
        borders.remove();
        for (const [el, attributes] of decorated) {
          for (const [name, value] of Object.entries({ tabindex: attributes.tabindex, "aria-label": attributes.label, "aria-describedby": attributes.describedby })) {
            if (value === null) el.removeAttribute(name);
            else el.setAttribute(name, value);
          }
          el.classList.remove("bmg-math-term");
        }
        decorated.clear();
        rendered.clear();
      };
      return cleanup;
    }
    return {
      config,
      attach,
      async typeset(elements, mathJax = getMathJax()) {
        await mathJax.startup.promise;
        await mathJax.typesetPromise(elements);
      },
      destroy() {
        cleanup?.();
        entries.clear();
        keys.clear();
        groups.clear();
        groupKeys.clear();
      }
    };
  }

  // scripts/common-elements.js
  window.GraphRenderer = GraphRenderer;
  window.mathTooltips = createMathTooltips({
    mathJax: { tex: { inlineMath: [["$", "$"], ["\\(", "\\)"]] } }
  });
  window.MathJax = window.mathTooltips.config;
  document.addEventListener("DOMContentLoaded", () => {
    window.MathJax.startup.promise.then(() => window.mathTooltips.attach());
  });
})();
