/**
 * Offline assertions for dsh-claude-effort-picker.
 *
 * The bundle under test is the shipped artifact: it is evaluated the way the
 * client module system evaluates it (`window.__ModuleLoader__.load`), with a
 * fake `react` / `react-dom` / DOM. Nothing here re-implements plugin logic —
 * every assertion runs the real code paths.
 *
 * Run: node test/client.test.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = readFileSync(join(root, "lib/client.js"), "utf8");

let passed = 0;
const failures = [];
const notes = [];
async function check(name, fn) {
	try {
		await fn();
		passed += 1;
	} catch (error) {
		failures.push(`${name}: ${error && error.message ? error.message : error}`);
	}
}
function assert(condition, message) {
	if (!condition) throw new Error(message || "assertion failed");
}
function equal(actual, expected, message) {
	const a = JSON.stringify(actual);
	const e = JSON.stringify(expected);
	if (a !== e) throw new Error(`${message || "not equal"}: got ${a}, want ${e}`);
}

/* ------------------------------------------------------------------ */
/* fake platform                                                       */
/* ------------------------------------------------------------------ */

function makeElement() {
	return {
		dataset: {},
		textContent: "",
		className: "",
		children: [],
		appendChild(child) {
			this.children.push(child);
			return child;
		},
		addEventListener() {},
		removeEventListener() {}
	};
}

/** The minimum a rendered host element offers to the component's refs and geometry code. */
function makeDomNode() {
	const node = {
		offsetWidth: 420,
		offsetHeight: 150,
		scrollHeight: 150,
		style: {},
		dataset: {},
		disabled: false,
		focus() {},
		contains: () => false,
		click() {},
		setAttribute() {},
		removeAttribute() {},
		getBoundingClientRect: () => ({ left: 100, top: 500, right: 520, bottom: 528, width: 420, height: 28 }),
		setPointerCapture() {},
		releasePointerCapture() {},
		querySelector: () => null,
		querySelectorAll: () => []
	};
	return node;
}

function installPlatform() {
	const head = makeElement();
	const body = makeElement();
	const document = {
		head,
		body,
		activeElement: null,
		querySelector: () => null,
		querySelectorAll: () => [],
		getElementById: () => null,
		createElement: () => makeElement(),
		addEventListener() {},
		removeEventListener() {}
	};
	const window = {
		addEventListener() {},
		removeEventListener() {},
		innerWidth: 1280,
		innerHeight: 800
	};
	const registrations = [];
	window.__ModuleLoader__ = { mode: "queue", load: (registration) => registrations.push(registration) };
	globalThis.window = window;
	globalThis.document = document;
	globalThis.requestAnimationFrame = (fn) => {
		fn();
		return 1;
	};
	globalThis.cancelAnimationFrame = () => {};
	globalThis.HTMLElement = class HTMLElement {};
	return { window, document, registrations };
}

/* ------------------------------------------------------------------ */
/* mini React: one hook table per render instance                      */
/* ------------------------------------------------------------------ */

function makeReact() {
	const instances = new Map();
	let active = null;
	function table() {
		if (active === null) throw new Error("hook called outside a render");
		return active;
	}
	const React = {
		createElement(type, props, ...children) {
			const merged = Object.assign({}, props);
			if (children.length === 1) merged.children = children[0];
			else if (children.length > 1) merged.children = children;
			/* The harness has no DOM, so a rendered host element *is* the node a ref points at. */
			if (merged.ref !== null && typeof merged.ref === "object" && "current" in merged.ref) {
				merged.ref.current = makeDomNode();
			}
			return { type, props: merged };
		},
		useId: () => "t0",
		useState(initial) {
			const inst = table();
			const at = inst.index++;
			if (inst.slots[at] === undefined) inst.slots[at] = typeof initial === "function" ? initial() : initial;
			const set = (value) => {
				inst.slots[at] = typeof value === "function" ? value(inst.slots[at]) : value;
			};
			return [inst.slots[at], set];
		},
		useRef(initial) {
			const inst = table();
			const at = inst.index++;
			if (inst.slots[at] === undefined) inst.slots[at] = { current: initial };
			return inst.slots[at];
		},
		useMemo(fn) {
			const inst = table();
			const at = inst.index++;
			if (inst.slots[at] === undefined) inst.slots[at] = fn();
			return inst.slots[at];
		},
		useCallback(fn) {
			return fn;
		},
		useEffect(fn) {
			table().effects.push(fn);
		},
		useLayoutEffect(fn) {
			table().effects.push(fn);
		},
		useSyncExternalStore(subscribe, getSnapshot) {
			return getSnapshot();
		}
	};
	/**
	 * Render one component instance. The key identifies the instance, so an
	 * open/close cycle re-reads the state its own previous render stored.
	 */
	React.__render = (component, props, key) => {
		let inst = instances.get(key);
		if (inst === undefined) {
			inst = { slots: [], index: 0, effects: [] };
			instances.set(key, inst);
		}
		active = inst;
		inst.index = 0;
		inst.effects = [];
		let tree;
		try {
			tree = component(props);
		} finally {
			const effects = inst.effects;
			active = null;
			for (const effect of effects) {
				try {
					effect();
				} catch (error) {
					/* effects may touch DOM the harness does not model */
				}
			}
		}
		return tree;
	};
	return React;
}

function makeReactDom() {
	return {
		createPortal(node) {
			return { portal: true, node };
		}
	};
}

/** Load the shipped bundle with the fakes and return its exports. */
function loadBundle() {
	const { registrations } = installPlatform();
	const React = makeReact();
	const reactDom = makeReactDom();
	const require = (specifier) => {
		if (specifier === "react") return React;
		if (specifier === "react-dom") return reactDom;
		throw new Error(`unexpected require(${JSON.stringify(specifier)})`);
	};
	new Function("window", "document", source)(globalThis.window, globalThis.document);
	const registration = registrations[0];
	assert(registration !== undefined, "the bundle registered no module");
	equal(registration.id, "dsh-claude-effort-picker", "module id");
	const exports = registration.factory(require);
	return { exports, React, registration };
}

/* ------------------------------------------------------------------ */
/* tree helpers                                                        */
/* ------------------------------------------------------------------ */

function walk(node, visit) {
	if (node === null || node === undefined || typeof node !== "object") return;
	if (Array.isArray(node)) {
		for (const child of node) walk(child, visit);
		return;
	}
	if (node.portal === true) {
		walk(node.node, visit);
		return;
	}
	visit(node);
	const children = node.props ? node.props.children : undefined;
	if (children !== undefined) walk(children, visit);
}

function hasClass(node, name) {
	if (node === undefined || node === null || node.props === undefined) return false;
	const value = node.props.className;
	return typeof value === "string" && value.split(/\s+/).includes(name);
}

function findAll(tree, predicate) {
	const found = [];
	walk(tree, (node) => {
		if (predicate(node)) found.push(node);
		return undefined;
	});
	return found;
}

function byClass(tree, name) {
	return findAll(tree, (node) => hasClass(node, name));
}

function textOf(tree) {
	const parts = [];
	const visit = (node) => {
		if (typeof node === "string" || typeof node === "number") {
			parts.push(String(node));
			return;
		}
		if (Array.isArray(node)) {
			for (const child of node) visit(child);
			return;
		}
		if (node === null || node === undefined || typeof node !== "object") return;
		if (node.portal === true) {
			visit(node.node);
			return;
		}
		if (node.props !== undefined) visit(node.props.children);
	};
	visit(tree);
	return parts.join(" ");
}

function findSlider(tree) {
	return findAll(tree, (node) => node.props !== undefined && node.props.role === "slider")[0];
}

function findTrigger(tree) {
	return findAll(tree, (node) => hasClass(node, "cep-trigger"))[0];
}

function findDialog(tree) {
	return findAll(tree, (node) => node.props !== undefined && node.props.role === "dialog")[0];
}

function findItems(tree) {
	return findAll(tree, (node) => node.props !== undefined && node.props["data-cep-item"] !== undefined);
}

/* ------------------------------------------------------------------ */
/* fixtures                                                            */
/* ------------------------------------------------------------------ */

const DEEPSEEK_REASONING = {
	defaultEffort: "high",
	efforts: [
		{ id: "off", name: "Off" },
		{ id: "low", name: "Low" },
		{ id: "high", name: "High" },
		{ id: "max", name: "Max" }
	]
};

function makeSnapshot(overrides) {
	return Object.assign(
		{
			current: { provider: "deepseek-account", model: "deepseek-v41-flash", reasoningEffort: "high" },
			routable: true,
			groups: [
				{
					id: "deepseek-account",
					name: "DeepSeek Account",
					models: [
						{ id: "deepseek-v41-flash", name: "DeepSeek-V41-Flash", reasoning: DEEPSEEK_REASONING },
						{ id: "deepseek-v4-pro", name: "DeepSeek-V4-Pro", reasoning: DEEPSEEK_REASONING }
					]
				},
				{
					id: "deepseek-official",
					name: "DeepSeek",
					models: [{ id: "deepseek-v41", name: "DeepSeek-V41", reasoning: DEEPSEEK_REASONING }]
				}
			],
			failures: [],
			status: "ready",
			pending: null,
			error: null,
			retainedEffort: undefined
		},
		overrides
	);
}

function makeStore(snapshot) {
	return {
		snapshot,
		listeners: new Set(),
		getSnapshot() {
			return this.snapshot;
		},
		subscribe(listener) {
			this.listeners.add(listener);
			return () => this.listeners.delete(listener);
		}
	};
}

/**
 * One seat instance: `props`, the recorded `select`/`load` calls, and helpers
 * that re-render the same instance after a state or store change.
 */
function makeSeat(overrides, key, React, Seat) {
	const calls = { load: 0, selections: [] };
	const store = makeStore(makeSnapshot(overrides && overrides.snapshot));
	const props = Object.assign(
		{
			locked: false,
			available: true,
			sessionId: "session-1",
			directory: store,
			load() {
				calls.load += 1;
			},
			select(selection) {
				calls.selections.push(selection);
				return Promise.resolve({ ok: true, value: selection });
			}
		},
		overrides && overrides.props
	);
	const render = () => React.__render(Seat, props, key);
	const seat = {
		props,
		calls,
		store,
		render,
		open() {
			const trigger = findTrigger(render());
			assert(trigger !== undefined, "trigger rendered");
			trigger.props.onClick();
			const opened = render();
			assert(findDialog(opened) !== undefined, "panel opened");
			return opened;
		},
		setSnapshot(next) {
			store.snapshot = makeSnapshot(next);
		}
	};
	return seat;
}

/* ------------------------------------------------------------------ */
/* tests                                                               */
/* ------------------------------------------------------------------ */

const loaded = loadBundle();
const exports = loaded.exports;
const React = loaded.React;
const Seat = exports.__testables.ClaudeEffortSeat;
const T = exports.__testables;

await check("bundle exposes apply and inject", () => {
	assert(typeof exports.apply === "function", "apply must be a function");
	equal(exports.inject, ["locale", "sessions", "slots", "modelDirectories"], "service inject list");
});

await check("locale dictionaries share one key set", () => {
	equal(Object.keys(T.zh).sort(), Object.keys(T.en).sort(), "zh and en keys");
	for (const key of Object.keys(T.zh)) assert(String(T.zh[key]).length > 0, `empty zh value for ${key}`);
	for (const key of Object.keys(T.en)) assert(String(T.en[key]).length > 0, `empty en value for ${key}`);
	assert(T.zh["panel.burn"] === "更快消耗使用额度", "the burn hint copy");
	assert(T.zh["panel.reset"] === "重置为 Off", "the reset copy");
});

await check("every translated key used by the bundle exists in both dictionaries", () => {
	const used = new Set();
	const re = /\bt\("([^"]+)"/g;
	let match;
	while ((match = re.exec(source)) !== null) used.add(match[1]);
	assert(used.size > 15, `expected many translated keys, found ${used.size}`);
	for (const key of used) {
		assert(T.zh[key] !== undefined, `zh is missing "${key}"`);
		assert(T.en[key] !== undefined, `en is missing "${key}"`);
	}
	for (const key of Object.keys(T.zh)) {
		if (!used.has(key)) notes.push(`unused dictionary key "${key}"`);
	}
});

await check("styles cover the slab's own control surface", () => {
	for (const selector of [".cep-trigger", ".cep-panel", ".cep-view", ".cep-tip", ".cep-boltBtn", ".cep-level", ".cep-modelBtn", ".cep-reset", ".cep-burn", ".cep-slider", ".cep-track", ".cep-tick", ".cep-fill", ".cep-knob", ".cep-bead", ".cep-item", ".cep-dot"]) {
		assert(T.CSS.includes(selector), `CSS is missing ${selector}`);
	}
	assert(T.CSS.includes("--cep-inset") && T.CSS.includes("--cep-pct"), "slider geometry variables");
	assert(T.CSS.includes("prefers-reduced-motion"), "reduced-motion handling");
	assert(T.CSS.includes("#8b5cf6"), "violet accent");
	assert(T.CSS.includes("linear-gradient(90deg,#3f7bfd"), "the default track is blue");
	assert(T.CSS.includes("@keyframes cep-flow"), "beads drift across the track");
	assert(!T.CSS.includes("cep-twinkle"), "the old twinkle is gone");
	assert(!T.CSS.includes("data-star"), "only beads: no star shapes");
	assert(T.CSS.includes("transition:left .2s"), "the knob glides to its stop");
	assert(T.CSS.includes("transition:width .2s"), "the fill glides with it");
	assert(T.CSS.includes("@keyframes cep-viewIn"), "views fade in");
	assert(T.CSS.includes(".cep-swap{animation:cep-viewIn"), "the header swap reuses the same fade");
	assert(!T.CSS.includes("cep-burnIn"), "the burn hint no longer has its own animation");
	assert(T.CSS.includes("@keyframes cep-open"), "the card unfolds on open");
	assert(T.CSS.includes("transform-origin:right bottom"), "it unfolds from the composer corner");
	assert(T.CSS.includes(".cep-panel[data-resizing]"), "the card clips while it resizes");
	assert(T.CSS.includes("transition:height .26s"), "the card's height animates");
	assert(T.CSS.includes(".cep-boltBtn[data-on]"), "the bolt has a purely visual pressed state");
	assert(T.CSS.includes(".cep-triggerBolt"), "the pill can show the bolt badge");
	assert(!T.CSS.includes("cep-fast[data-on]"), "the bolt still never touches the effort");
	assert(T.CSS.includes("--cep-blue:#2f7cf6"), "the lower stops are blue");
	assert(T.CSS.includes("color-mix(in srgb,var(--cep-accent-strong) var(--cep-blend),var(--cep-blue-strong))"), "the level text blends blue into violet");
	assert(T.CSS.includes("color-mix(in srgb,var(--cep-accent) var(--cep-blend)"), "the track's right end follows the same blend");
	assert(T.CSS.includes(".cep-trigger[data-top] .cep-triggerEffort"), "the pill's effort label stays neutral until the top stop");
});

await check("effort stops keep the adapter's order", () => {
	const levels = T.effortLevelsOf(DEEPSEEK_REASONING);
	equal(levels.map((level) => level.id), ["off", "low", "high", "max"], "stop ids");
	equal(levels.map((level) => level.name), ["Off", "Low", "High", "Max"], "stop names");
});

await check("a model without a default gets a provider-default stop", () => {
	const levels = T.effortLevelsOf({ efforts: [{ id: "low", name: "Low" }, { id: "high", name: "High" }] });
	equal(levels.length, 3, "stop count");
	equal(levels[0].id, undefined, "provider default carries no effort id");
	equal(levels[0].name, null, "provider default has no adapter name");
});

await check("a model without reasoning metadata has no stops", () => {
	equal(T.effortLevelsOf(undefined), [], "no reasoning");
	equal(T.effortLevelsOf({ efforts: [] }), [], "empty efforts");
	equal(T.effortLevelsOf({ defaultEffort: "high", efforts: [{ id: 7 }] }), [], "malformed efforts are dropped");
});

await check("level lookup, off detection and the reset target", () => {
	const levels = T.effortLevelsOf(DEEPSEEK_REASONING);
	equal(T.levelIndexOf(levels, "high"), 2, "high index");
	equal(T.levelIndexOf(levels, "nope"), -1, "unknown effort");
	equal(T.resetIndexFor(levels), 0, "reset goes to Off");
	const noOff = T.effortLevelsOf({ defaultEffort: "low", efforts: [{ id: "low", name: "Low" }, { id: "high", name: "High" }] });
	equal(T.resetIndexFor(noOff), 0, "without Off the reset goes to the lowest level");
	assert(T.isOffLevel({ id: "off" }), "off id");
	assert(T.isOffLevel({ id: "x", name: "关闭" }), "off by localized name");
	assert(!T.isOffLevel({ id: "low", name: "Low" }), "low is not off");
});

await check("slider geometry snaps and stays inside the rail", () => {
	equal(T.positionOfIndex(0, 4), 0, "first stop at 0");
	equal(T.positionOfIndex(3, 4), 1, "last stop at 1");
	equal(T.positionOfIndex(1, 4), 1 / 3, "second stop one third");
	equal(T.positionOfIndex(0, 1), 0, "single stop");
	for (let value = -1; value <= 2; value += 0.05) {
		const index = T.snapIndex(value, 4);
		assert(index >= 0 && index <= 3, `snapIndex(${value}) out of range: ${index}`);
	}
	equal(T.snapIndex(0, 4), 0, "left edge");
	equal(T.snapIndex(1, 4), 3, "right edge");
	equal(T.snapIndex(0.5, 4), 2, "middle rounds up to the third stop");
	equal(T.snapIndex(0.49, 4), 1, "just below middle");
});

await check("pointer mapping reaches both ends with the knob inset", () => {
	const rect = { left: 100, width: 200 };
	equal(T.pointerPosition(100, rect), 0, "pointer at the rail's left edge");
	equal(T.pointerPosition(300, rect), 1, "pointer at the rail's right edge");
	equal(T.pointerPosition(200, rect), 0.5, "pointer at the center");
	equal(T.pointerPosition(500, rect), 1, "beyond the right edge clamps");
	equal(T.pointerPosition(0, rect), 0, "beyond the left edge clamps");
	equal(T.pointerPosition(150, { left: 0, width: 10 }), 0, "degenerate rail");
	equal(T.KNOB > T.TRACK, true, "the knob is taller than the track (the slab's weight)");
});

await check("the bead stream is deterministic and irregular", () => {
	const first = T.dotsFor(16);
	const second = T.dotsFor(16);
	equal(first, second, "same stream on every call");
	equal(first.length, 16, "bead count");
	for (const bead of first) {
		assert(bead.top >= 10 && bead.top <= 90, `top out of range: ${bead.top}`);
		assert(bead.size >= 2 && bead.size <= 5, `size out of range: ${bead.size}`);
		assert(bead.phase < 0, "phases are negative so the stream is already flowing");
		assert(bead.stretch >= 0.9 && bead.stretch <= 1.1, `stretch out of range: ${bead.stretch}`);
		assert(bead.opacity >= 0.3 && bead.opacity <= 1, `opacity out of range: ${bead.opacity}`);
	}
	const heights = new Set(first.map((bead) => bead.top));
	assert(heights.size > 6, "heights are irregular, not one row");
	const phases = new Set(first.map((bead) => bead.phase));
	assert(phases.size > 6, "phases are irregular, not one uniform spacing");
});

await check("the colour blends across the last segment only", () => {
	/* 4 stops: blue up to and including High (2/3), then a ramp into Max. */
	equal(T.blendFor(4, 0), 0, "Off is pure blue");
	equal(T.blendFor(4, 1 / 3), 0, "Low is pure blue");
	equal(T.blendFor(4, 2 / 3), 0, "High is the last pure-blue stop");
	const mid = T.blendFor(4, (2 / 3 + 1) / 2);
	assert(Math.abs(mid - 0.5) < 1e-9, `halfway between High and Max is half violet: ${mid}`);
	equal(T.blendFor(4, 1), 1, "Max is pure violet");
	const ramp = T.blendFor(4, 0.9);
	assert(Math.abs(ramp - 0.7) < 1e-9, `the ramp is linear: ${ramp}`);
	equal(T.blendFor(2, 0), 0, "two stops: the lower one is blue");
	equal(T.blendFor(2, 1), 1, "two stops: the upper one is violet");
	equal(T.blendFor(1, 0), 0, "a single stop never blends");
});

await check("the beads speed up with the level and the bolt", () => {
	equal(T.flowSpeedFor(false, false), 1, "High and below: 1x");
	equal(T.flowSpeedFor(true, false), 1.5, "the top stop alone: 1.5x");
	equal(T.flowSpeedFor(false, true), 1.5, "the bolt alone: 1.5x");
	equal(T.flowSpeedFor(true, true), 2, "both: 2x");
});

await check("providers keep the shipped order", () => {
	const ordered = T.orderedGroups([
		{ id: "acme" },
		{ id: "deepseek-official" },
		{ id: "deepseek-account" },
		{ id: "zeta" }
	]);
	equal(ordered.map((group) => group.id), ["deepseek-account", "deepseek-official", "acme", "zeta"], "provider order");
});

await check("model search ranks prefix, substring, then subsequence", () => {
	const models = [
		{ id: "a", name: "DeepSeek-V4" },
		{ id: "b", name: "My DeepSeek" },
		{ id: "c", name: "Delta Echo Echo Papa" },
		{ id: "d", name: "unrelated" }
	];
	equal(T.filterModels(models, "deep").map((model) => model.id), ["a", "b", "c"], "ranked ids");
	equal(T.filterModels(models, "  ").length, 4, "blank query keeps every row");
	equal(T.filterModels(models, "").length, 4, "empty query keeps every row");
	equal(T.filterModels(models, "zzz").length, 0, "no match");
	assert(T.interpolate("{a}-{b}", { a: 1, b: 2 }) === "1-2", "interpolation");
	equal(T.interpolate("{missing}", {}), "{missing}", "unknown placeholders stay literal");
});

await check("selection errors are explained", () => {
	equal(T.describeError({ code: "session/writer-held" }, (key) => key), "error.sessionInUse", "writer held");
	equal(T.describeError({ message: "boom" }, (key) => key), "boom", "message passthrough");
	equal(T.describeError(null, (key) => key), "error.unknown", "missing error");
});

await check("group identity tracks the rendered shape", () => {
	const a = T.groupingKey([{ id: "p", models: [{ id: "m1" }] }]);
	const b = T.groupingKey([{ id: "p", models: [{ id: "m1" }] }]);
	const c = T.groupingKey([{ id: "p", models: [{ id: "m2" }] }]);
	equal(a, b, "same shape");
	assert(a !== c, "different models differ");
});

/* ---- registration through the real apply() ---- */

function makeCtx(options) {
	const captured = { registered: [], dictionaries: null, effects: [], slotInjectName: undefined };
	const services = Object.assign(
		{
			locale: {
				register(ns, dictionaries) {
					captured.dictionaries = { ns: ns, dictionaries: dictionaries };
					return () => {};
				},
				bind: () => (key, params) => T.interpolate(T.zh[key] === undefined ? key : T.zh[key], params)
			},
			sessions: { subagentAddress: () => undefined, binding: () => ({ id: "binding-1" }) },
			slots: {
				inject(name, run) {
					captured.slotInjectName = name;
					run();
				},
				register(registration, component) {
					captured.registered.push({ registration: registration, component: component });
					return () => {};
				}
			},
			modelDirectories: {
				directoryFor(sessionId) {
					captured.directorySession = sessionId;
					return {
						store: makeStore(makeSnapshot()),
						load: () => Promise.resolve(makeSnapshot()),
						select: (selection) => Promise.resolve({ ok: true, value: selection })
					};
				}
			}
		},
		options && options.services
	);
	const scope = Object.assign({}, services, {
		effect(run) {
			const disposer = run();
			if (typeof disposer === "function") captured.effects.push(disposer);
		}
	});
	const ctx = {
		locale: services.locale,
		effect(run) {
			const disposer = run();
			if (typeof disposer === "function") captured.effects.push(disposer);
		},
		inject(names, run) {
			run(scope);
		}
	};
	return { ctx, captured, services };
}

await check("apply registers the composer seat at a shadowing priority", () => {
	const { ctx, captured } = makeCtx();
	exports.apply(ctx);
	equal(captured.dictionaries.ns, "claude-effort-picker", "dictionary namespace");
	equal(captured.slotInjectName, "conversation.input.model", "seat name");
	equal(captured.registered.length, 1, "one registration");
	const registration = captured.registered[0].registration;
	equal(registration.name, "conversation.input.model", "registration name");
	equal(registration.priority, -10, "priority must sit below the shipped 0 to shadow it");
	equal(registration.locale, "claude-effort-picker", "locale namespace");
	assert(typeof captured.registered[0].component === "function", "seat component installed");
	const face = registration.inject("session-9");
	equal(face.sessionId, "session-9", "session id forwarded");
	equal(face.available, true, "available for an ordinary session");
	equal(captured.directorySession, undefined, "resolution is lazy: a switch cannot throw out of inject");
	/* the first read resolves the real directory */
	const snapshot = face.directory.getSnapshot();
	equal(captured.directorySession, "session-9", "directory resolved on first read");
	equal(snapshot.current.provider, "deepseek-account", "real snapshot served");
	assert(typeof face.directory.subscribe === "function", "store face subscribes");
	assert(typeof face.load === "function" && typeof face.select === "function", "verbs forwarded");
	face.close();
});

await check("the seat face survives a session switch and recovers by itself", async () => {
	let attempts = 0;
	const realStore = makeStore(makeSnapshot());
	const services = {
		sessions: { subagentAddress: () => undefined, binding: () => ({ id: "binding-x" }) },
		modelDirectories: {
			directoryFor() {
				attempts += 1;
				if (attempts <= 2) throw new Error('ui-model-selection: session "s-1" resolved no scope');
				return {
					store: realStore,
					load: () => Promise.resolve(),
					select: () => Promise.resolve({ ok: true })
				};
			}
		}
	};
	const face = T.makeSeatFace({ models: services.modelDirectories, sessions: services.sessions }, "s-1");
	equal(face.directory.getSnapshot().status, "loading", "a missing scope yields the loading snapshot instead of a throw");
	let notified = 0;
	face.directory.subscribe(() => { notified += 1; });
	face.load();
	await new Promise((resolve) => setTimeout(resolve, 600));
	assert(notified > 0, "subscribers are woken once the scope appears");
	equal(face.directory.getSnapshot().current.provider, "deepseek-account", "and real data replaces the placeholder");
	face.close();
});

await check("a face whose session never gets a scope stays quiet", async () => {
	let calls = 0;
	const face = T.makeSeatFace({
		models: { directoryFor() { calls += 1; return { store: makeStore(makeSnapshot()) }; } },
		sessions: { subagentAddress: () => undefined, binding: () => undefined }
	}, "lonely");
	equal(face.directory.getSnapshot().status, "loading", "still the loading snapshot");
	equal(face.available, true, "the session is addressable, just not mounted yet");
	face.select({ provider: "p", model: "m" }).then((value) => equal(value, undefined, "selecting before the scope is a no-op")).catch(() => {});
	await new Promise((resolve) => setTimeout(resolve, 150));
	equal(calls, 0, "directoryFor is not even asked while the binding is missing");
	face.close();
});

await check("a seat with an unusable store renders instead of crashing", () => {
	const brokenStore = {
		getSnapshot() { throw new Error("disposed store"); },
		subscribe() { throw new Error("disposed store"); }
	};
	const tree = React.__render(Seat, { locked: false, available: true, sessionId: "s", directory: brokenStore, load() {}, select() {} }, "broken-store");
	const trigger = findTrigger(tree);
	assert(trigger !== undefined, "the trigger still renders");
	assert(textOf(trigger).includes("正在加载"), "it falls back to the loading label");
	assert(trigger.props.disabled === false, "and stays clickable");

	const tree2 = React.__render(Seat, { sessionId: "s" }, "no-store");
	const trigger2 = findTrigger(tree2);
	assert(trigger2 !== undefined, "a missing store renders too");
	equal(trigger2.props.disabled, true, "but it is inert rather than crashing");
});

await check("addressed subagent sessions are unavailable", () => {
	const { ctx, captured } = makeCtx({ services: { sessions: { subagentAddress: () => ({ agentId: "a" }), binding: () => ({ id: "binding-1" }) } } });
	exports.apply(ctx);
	const face = captured.registered[0].registration.inject("sub-1");
	equal(face.available, false, "availability flag");
	face.close();
});

await check("/model is redirected to the same slab and restored on dispose", () => {
	const contribution = { name: "model", available: () => true, ui: { kind: "popupSelect", options: () => [] } };
	const { ctx, captured } = makeCtx({ services: { commandUi: { live: { contributions: new Map([["model", contribution]]) } } } });
	exports.apply(ctx);
	equal(contribution.ui.kind, "action", "the shipped popup was swapped for an action");
	const seen = [];
	const unsubscribe = T.subscribeOpen("session-7", () => seen.push("open"));
	contribution.ui.run({ sessionId: "session-7" });
	equal(seen, ["open"], "the action asked the resident seat to open");
	contribution.ui.run({ sessionId: "session-unknown" });
	equal(seen.length, 1, "an unknown session opens nothing");
	unsubscribe();
	for (const dispose of captured.effects) dispose();
	equal(contribution.ui.kind, "popupSelect", "the shipped popup came back on dispose");
});

await check("a different /model contribution is left alone", () => {
	const custom = { name: "model", ui: { kind: "action", run() {} } };
	const first = makeCtx({ services: { commandUi: { live: { contributions: new Map([["model", custom]]) } } } });
	exports.apply(first.ctx);
	equal(custom.ui.kind, "action", "an action contribution is untouched");

	const other = { name: "model", ui: { kind: "popupSelect" } };
	const second = makeCtx({ services: { commandUi: { live: { contributions: new Map([["model", other]]) } } } });
	exports.apply(second.ctx);
	equal(other.ui.kind, "action", "a popupSelect is swapped");

	const missing = makeCtx({ services: { commandUi: { live: { contributions: new Map() } } } });
	exports.apply(missing.ctx);
	assert(true, "a missing contribution does not throw");
});

/* ---- rendering: trigger ---- */

await check("the closed trigger names the model and its effort", () => {
	const seat = makeSeat(null, "trigger-closed", React, Seat);
	const trigger = findTrigger(seat.render());
	assert(trigger !== undefined, "trigger rendered");
	equal(trigger.props["aria-haspopup"], "dialog", "popup semantics");
	equal(trigger.props["aria-expanded"], false, "closed");
	equal(trigger.props.title, "DeepSeek-V41-Flash · High", "title");
	assert(textOf(trigger).includes("DeepSeek-V41-Flash"), "model name shown");
	assert(textOf(trigger).includes("High"), "effort name shown");
	equal(byClass(trigger, "cep-triggerBolt").length, 0, "no bolt decoration in the pill");
});

await check("the trigger carries the composer's compact-icon share", () => {
	const seat = makeSeat(null, "compact", React, Seat);
	const trigger = findTrigger(seat.render());
	const icon = byClass(trigger, "cep-triggerIcon")[0];
	assert(icon !== undefined, "compact icon rendered");
	assert(T.CSS.includes("--dsh-composer-model-text-display"), "text share honours the composer's collapse variable");
	assert(T.CSS.includes("--dsh-composer-model-icon-display"), "icon share honours the composer's collapse variable");
	equal(icon.props["aria-hidden"], "true", "the icon is decorative; the trigger's aria-label carries the name");
});

await check("the trigger is disabled for an unavailable session", () => {
	const seat = makeSeat({ props: { available: false } }, "trigger-disabled", React, Seat);
	const trigger = findTrigger(seat.render());
	equal(trigger.props.disabled, true, "disabled");
	trigger.props.onClick();
	equal(findDialog(seat.render()), undefined, "a disabled seat opens nothing");
});

/* ---- rendering: the slab ---- */

await check("the slab is a head plus one fat slider", () => {
	const seat = makeSeat(null, "slab", React, Seat);
	const opened = seat.open();
	equal(seat.calls.load, 1, "the catalog was asked to load");
	const head = byClass(opened, "cep-head")[0];
	assert(head !== undefined, "head rendered");
	const slider = findSlider(opened);
	assert(slider !== undefined, "slider rendered");
	equal(slider.props["aria-valuemin"], 0, "slider minimum");
	equal(slider.props["aria-valuemax"], 3, "slider maximum");
	equal(slider.props["aria-valuenow"], 2, "slider sits on High");
	equal(slider.props["aria-valuetext"], "High", "slider text");
	equal(byClass(opened, "cep-track").length, 1, "one track");
	equal(byClass(opened, "cep-knob").length, 1, "one knob");
	equal(byClass(opened, "cep-fill")[0].props.style["--cep-pct"], String(2 / 3), "fill follows the current stop");
	equal(byClass(opened, "cep-bead").length, 16, "the filled part carries the bead stream");
	assert(String(byClass(opened, "cep-bead")[0].props.style.animationDelay).endsWith("s"), "bead phases are fixed times, so a speed change cannot reset them");
});

await check("every level owns one solid dot on the track", () => {
	const seat = makeSeat(null, "ticks", React, Seat);
	const opened = seat.open();
	const ticks = byClass(opened, "cep-tick");
	equal(ticks.length, 4, "one dot per level");
	equal(ticks.map((tick) => tick.props.style["--cep-pct"]), ["0", String(1 / 3), String(2 / 3), "1"], "dots sit on the stops");
	for (const tick of ticks) equal(tick.props.style["--cep-inset"], "44px", "dots share the knob's axis");
	const track = byClass(opened, "cep-track")[0];
	const children = Array.isArray(track.props.children) ? track.props.children : [track.props.children];
	assert(hasClass(children[0][0], "cep-tick"), "dots are painted before the fill, so a full track hides them");
	assert(hasClass(children[1], "cep-fill"), "the fill comes after the dots");
});

await check("the bolt is a real button that only lights itself up", () => {
	const seat = makeSeat(null, "bolt", React, Seat);
	let opened = seat.open();
	const wrap = byClass(opened, "cep-boltWrap")[0];
	assert(wrap !== undefined, "bolt wrapper rendered");
	const bolt = byClass(opened, "cep-boltBtn")[0];
	assert(bolt !== undefined, "bolt button rendered");
	equal(bolt.type, "button", "a real button element");
	equal(bolt.props.type, "button", "type=button");
	equal(typeof bolt.props.onClick, "function", "it is clickable");
	equal(bolt.props["aria-pressed"], false, "unpressed at rest");
	assert(bolt.props["aria-label"].includes("2x speed"), "it names itself");
	assert(bolt.props.title.includes("用量更多"), "the hover title still explains it");
	equal(bolt.props["aria-hidden"], undefined, "an interactive control is not hidden from assistive tech");
	equal(bolt.props["data-on"], undefined, "no pressed styling yet");
	const tip = byClass(opened, "cep-tip")[0];
	assert(tip !== undefined, "tooltip rendered");
	equal(tip.props["aria-hidden"], "true", "the bubble is decorative");
	equal(byClass(tip, "cep-tipTitle")[0].props.children, "2x speed", "the headline");
	equal(byClass(tip, "cep-tipMore")[0].props.children, "用量更多", "the second line");

	bolt.props.onClick();
	opened = seat.render();
	equal(byClass(opened, "cep-boltBtn")[0].props["data-on"], "", "the pressed look lights the bolt");
	equal(byClass(opened, "cep-boltBtn")[0].props["aria-pressed"], true, "pressed state");
	equal(byClass(findTrigger(opened), "cep-triggerBolt").length, 1, "the pill gains its badge");
	equal(seat.calls.selections.length, 0, "the click writes nothing");
	equal(findSlider(opened).props["aria-valuenow"], 2, "the level did not move to Max");

	byClass(opened, "cep-boltBtn")[0].props.onClick();
	opened = seat.render();
	equal(byClass(opened, "cep-boltBtn")[0].props["data-on"], undefined, "a second click releases it");
	equal(byClass(findTrigger(opened), "cep-triggerBolt").length, 0, "the badge goes away with it");
});

await check("the bolt stays lit below Max and is never derived from the level", () => {
	const seat = makeSeat(null, "bolt-below", React, Seat);
	let opened = seat.open();
	byClass(opened, "cep-boltBtn")[0].props.onClick();
	opened = seat.render();
	equal(byClass(findTrigger(opened), "cep-triggerBolt").length, 1, "lit at High");
	seat.setSnapshot({ current: { provider: "deepseek-account", model: "deepseek-v41-flash", reasoningEffort: "off" } });
	opened = seat.render();
	equal(findSlider(opened).props["aria-valuenow"], 0, "the level is Off");
	equal(byClass(findTrigger(opened), "cep-triggerBolt").length, 1, "the badge survives a level change");
	equal(byClass(opened, "cep-boltBtn")[0].props["data-on"], "", "and so does the bolt");
});

await check("the reset control goes back to Off", () => {
	const seat = makeSeat(null, "reset", React, Seat);
	const opened = seat.open();
	const reset = byClass(opened, "cep-reset")[0];
	assert(reset !== undefined, "reset rendered");
	equal(reset.props.disabled, false, "enabled with levels");
	equal(reset.props.title, "重置为 Off", "reset explains itself");
	reset.props.onClick();
	equal(seat.calls.selections.length, 1, "one write");
	equal(seat.calls.selections[0], { provider: "deepseek-account", model: "deepseek-v41-flash", reasoningEffort: "off" }, "off effort");
});

await check("the level and model labels sit above the track", () => {
	const seat = makeSeat(null, "labels", React, Seat);
	const opened = seat.open();
	const level = byClass(opened, "cep-level")[0];
	equal(textOf(level), "High ›", "the level name and its chevron");
	const modelBtn = byClass(opened, "cep-modelBtn")[0];
	equal(textOf(modelBtn), "DeepSeek-V41-Flash", "the model name under it");
	equal(modelBtn.props.title, "选择模型，当前 DeepSeek-V41-Flash", "model button explains itself");
});

await check("dragging to the top shows the burn hint before release", () => {
	const seat = makeSeat(null, "burn", React, Seat);
	let opened = seat.open();
	const slider = findSlider(opened);
	/* press at the far right: the knob is at the top stop, the finger still down */
	slider.props.onPointerDown({ clientX: 520, button: 0, pointerId: 1, preventDefault() {}, stopPropagation() {} });
	opened = seat.render();
	equal(byClass(opened, "cep-burn").length, 1, "the burn hint took over the header");
	equal(textOf(byClass(opened, "cep-burn")[0]), "更快消耗使用额度", "hint copy");
	equal(byClass(opened, "cep-level").length, 0, "the level label gives way");
	/* the swap fades exactly like a view change, and the card re-measures */
	const burnTitles = byClass(opened, "cep-titles")[0];
	assert(hasClass(burnTitles, "cep-swap"), "the burn header fades in");
	equal(burnTitles.props.key, "titles-burn", "a fresh key, so the fade replays");
	equal(seat.calls.selections.length, 0, "nothing is written while the pointer is down");
	findSlider(opened).props.onPointerUp({ pointerId: 1 });
	equal(seat.calls.selections.length, 1, "release writes once");
	equal(seat.calls.selections[0].reasoningEffort, "max", "the top stop");
	equal(byClass(seat.render(), "cep-burn").length, 1, "the hint lingers after release");
});

await check("only the top stop turns violet", () => {
	const seat = makeSeat(null, "top-color", React, Seat);
	let opened = seat.open();
	equal(findTrigger(opened).props["data-top"], undefined, "the pill is neutral at High");
	equal(findDialog(opened).props["data-top"], undefined, "the card is blue at High");

	/* live during the drag, before any write */
	findSlider(opened).props.onPointerDown({ clientX: 520, button: 0, pointerId: 1, preventDefault() {}, stopPropagation() {} });
	opened = seat.render();
	equal(findDialog(opened).props["data-top"], "", "dragging onto the top stop turns the card violet");
	equal(byClass(findTrigger(opened), "cep-trigger")[0].props["data-top"], "", "and the pill with it");
	findSlider(opened).props.onPointerUp({ pointerId: 1 });
	seat.setSnapshot({ current: { provider: "deepseek-account", model: "deepseek-v41-flash", reasoningEffort: "max" } });
	opened = seat.render();
	equal(findDialog(opened).props["data-top"], "", "settled at Max stays violet");
	equal(findTrigger(opened).props["data-top"], "", "the pill's effort label is violet at Max");

	seat.setSnapshot({ current: { provider: "deepseek-account", model: "deepseek-v41-flash", reasoningEffort: "off" } });
	opened = seat.render();
	equal(findDialog(opened).props["data-top"], undefined, "Off is blue again");
	equal(findTrigger(opened).props["data-top"], undefined, "and the pill's label is grey again");
});

await check("the card publishes the blend token and accelerates without restarting", () => {
	const seat = makeSeat(null, "tokens", React, Seat);
	let opened = seat.open();
	let style = findDialog(opened).props.style;
	equal(style["--cep-blend"], "0%", "blue at High");
	equal(style["--cep-flow"], undefined, "speed is not a CSS token any more: it never restarts the stream");

	/* mid-way between High and Max: half violet */
	findSlider(opened).props.onPointerDown({ clientX: 435, button: 0, pointerId: 1, preventDefault() {}, stopPropagation() {} });
	opened = seat.render();
	style = findDialog(opened).props.style;
	const blend = Number(String(style["--cep-blend"]).replace("%", ""));
	assert(blend > 45 && blend < 55, `halfway blend: ${style["--cep-blend"]}`);

	/* onto the top stop: full violet */
	findSlider(opened).props.onPointerDown({ clientX: 520, button: 0, pointerId: 1, preventDefault() {}, stopPropagation() {} });
	opened = seat.render();
	equal(findDialog(opened).props.style["--cep-blend"], "100%", "violet at Max");
});

await check("the flow multiplier is applied to the running animations", () => {
	const played = [];
	const node = {
		querySelectorAll: () => [1, 2, 3].map(() => ({
			getAnimations: () => [
				{ updatePlaybackRate: (rate) => played.push(rate) },
				{ playbackRate: 1 }
			]
		}))
	};
	T.applyFlow(node, 1.5);
	equal(played, [1.5, 1.5, 1.5], "every bead animation is sped up in place");
	T.applyFlow(null, 2);
	T.applyFlow({}, 2);
	assert(true, "nodes without beads are ignored");

	/* the durations baked into the markup never change with the level */
	const first = T.dotsFor(16)[0];
	equal(typeof first.phase, "number", "phases stay fixed data");
});

await check("the burn hint is absent below the top stop", () => {
	const seat = makeSeat(null, "burn-low", React, Seat);
	let opened = seat.open();
	const slider = findSlider(opened);
	slider.props.onPointerDown({ clientX: 100, button: 0, pointerId: 1, preventDefault() {}, stopPropagation() {} });
	opened = seat.render();
	equal(byClass(opened, "cep-burn").length, 0, "no hint at the left end");
	equal(byClass(opened, "cep-level").length, 1, "the level label stays");
	const levelTitles = byClass(opened, "cep-titles")[0];
	assert(hasClass(levelTitles, "cep-swap"), "the level header fades in the same way");
	equal(levelTitles.props.key, "titles-level", "its own key");
});

await check("the knob stays on the released stop while the write is in flight", async () => {
	const seat = makeSeat({
		props: {
			select: () => new Promise(() => {
				/* never settles: the write is still in flight when we render */
			})
		}
	}, "optimistic", React, Seat);
	let opened = seat.open();
	findSlider(opened).props.onPointerDown({ clientX: 520, button: 0, pointerId: 1, preventDefault() {}, stopPropagation() {} });
	opened = seat.render();
	findSlider(opened).props.onPointerUp({ pointerId: 1 });
	/* the Host publishes the in-flight selection while `current` is still High */
	seat.setSnapshot({ pending: { provider: "deepseek-account", model: "deepseek-v41-flash", reasoningEffort: "max" } });
	opened = seat.render();
	equal(findSlider(opened).props["aria-valuenow"], 3, "knob holds the released stop");
	equal(byClass(opened, "cep-fill")[0].props.style["--cep-pct"], "1", "the fill holds it too");
	seat.setSnapshot({ current: { provider: "deepseek-account", model: "deepseek-v41-flash", reasoningEffort: "max" }, pending: null });
	opened = seat.render();
	equal(findSlider(opened).props["aria-valuenow"], 3, "and stays once the Host agrees");
});

await check("keyboard arrows step the effort and stop at the ends", () => {
	const seat = makeSeat(null, "keyboard", React, Seat);
	let opened = seat.open();
	const press = (key) => {
		const slider = findSlider(opened);
		slider.props.onKeyDown({ key: key, preventDefault() {}, stopPropagation() {} });
	};
	press("ArrowRight");
	equal(seat.calls.selections[0].reasoningEffort, "max", "right moves up one stop");
	seat.setSnapshot({ current: { provider: "deepseek-account", model: "deepseek-v41-flash", reasoningEffort: "max" } });
	opened = seat.render();
	press("End");
	equal(seat.calls.selections.length, 1, "End on the top stop writes nothing");
	press("Home");
	equal(seat.calls.selections[1].reasoningEffort, "off", "Home jumps to the first stop");
	seat.setSnapshot({ current: { provider: "deepseek-account", model: "deepseek-v41-flash", reasoningEffort: "off" } });
	opened = seat.render();
	press("ArrowLeft");
	equal(seat.calls.selections.length, 2, "already at the first stop writes nothing");
});

await check("Enter on the slider drills into the level list", () => {
	const seat = makeSeat(null, "enter-levels", React, Seat);
	let opened = seat.open();
	findSlider(opened).props.onKeyDown({ key: "Enter", preventDefault() {}, stopPropagation() {} });
	opened = seat.render();
	equal(findItems(opened).length, 4, "one row per level");
	equal(findSlider(opened), undefined, "the slider gave way to the list");
	equal(textOf(byClass(opened, "cep-listTitle")[0]), "推理等级", "list title");
});

await check("dragging the knob snaps to the nearest stop on release", () => {
	const seat = makeSeat(null, "drag", React, Seat);
	let opened = seat.open();
	const slider = findSlider(opened);
	slider.props.onPointerDown({ clientX: 0, button: 0, pointerId: 1, preventDefault() {}, stopPropagation() {} });
	opened = seat.render();
	equal(findSlider(opened).props["data-drag"], "", "drag state is visible");
	findSlider(opened).props.onPointerUp({ pointerId: 1 });
	equal(seat.calls.selections.length, 1, "release writes once");
	equal(seat.calls.selections[0].reasoningEffort, "off", "the far-left release picks the first stop");
});

await check("the level list writes the picked level and returns", () => {
	const seat = makeSeat(null, "levels-list", React, Seat);
	let opened = seat.open();
	byClass(opened, "cep-level")[0].props.onClick();
	opened = seat.render();
	const rows = findItems(opened);
	equal(rows.length, 4, "four levels");
	equal(rows[2].props["aria-checked"], true, "the current level is checked");
	rows[1].props.onClick();
	equal(seat.calls.selections[0].reasoningEffort, "low", "picked level written");
	opened = seat.render();
	equal(findSlider(opened) !== undefined, true, "the slab came back after picking");
});

/* ---- rendering: model list ---- */

await check("the model list is one tap away and keeps provider groups", () => {
	const seat = makeSeat(null, "models", React, Seat);
	let opened = seat.open();
	byClass(opened, "cep-modelBtn")[0].props.onClick();
	opened = seat.render();
	const rows = findItems(opened);
	equal(rows.length, 3, "one row per catalog model");
	equal(rows.filter((row) => row.props["aria-checked"]).length, 1, "exactly one checked row");
	equal(rows[0].props.role, "menuitemradio", "row semantics");
	assert(textOf(rows[0]).includes("DeepSeek-V41-Flash"), "first row is the current model");
	equal(byClass(opened, "cep-groupTitle").map((node) => node.props.children), ["DeepSeek 账号", "DeepSeek"], "localized group headings");
	const back = byClass(opened, "cep-back")[0];
	assert(back !== undefined, "a back control returns to the slab");
	back.props.onClick();
	equal(findSlider(seat.render()) !== undefined, true, "back returns to the slider");
});

await check("choosing another model writes that model's default effort and closes", () => {
	const seat = makeSeat(null, "choose", React, Seat);
	let opened = seat.open();
	byClass(opened, "cep-modelBtn")[0].props.onClick();
	opened = seat.render();
	findItems(opened)[1].props.onClick();
	equal(seat.calls.selections[0], { provider: "deepseek-account", model: "deepseek-v4-pro", reasoningEffort: "high" }, "new model keeps its own default effort");
	equal(findDialog(seat.render()), undefined, "the slab closes after a model change");
});

await check("every view is wrapped so it can fade in", () => {
	const seat = makeSeat(null, "view", React, Seat);
	let opened = seat.open();
	const sliderView = byClass(opened, "cep-view")[0];
	assert(sliderView !== undefined, "slider view wrapper rendered");
	byClass(opened, "cep-modelBtn")[0].props.onClick();
	opened = seat.render();
	const modelView = byClass(opened, "cep-view")[0];
	assert(modelView !== undefined, "model view wrapper rendered");
	assert(modelView.props.key !== undefined, "the wrapper is keyed by view, so React remounts it and replays the fade");
});

await check("the model list shows search only for large catalogs", () => {
	const small = makeSeat(null, "search-small", React, Seat);
	let opened = small.open();
	byClass(opened, "cep-modelBtn")[0].props.onClick();
	equal(byClass(small.render(), "cep-searchRow").length, 0, "three models need no search");

	const models = [];
	for (let i = 0; i < 8; i += 1) models.push({ id: `m${i}`, name: `Model ${i}`, reasoning: DEEPSEEK_REASONING });
	const large = makeSeat({
		snapshot: { current: { provider: "deepseek-account", model: "m0", reasoningEffort: "high" }, groups: [{ id: "deepseek-account", name: "DeepSeek Account", models: models }] }
	}, "search-large", React, Seat);
	opened = large.open();
	byClass(opened, "cep-modelBtn")[0].props.onClick();
	equal(byClass(large.render(), "cep-searchRow").length, 1, "eight models show search");
});

await check("a model without reasoning metadata has no slider", () => {
	const seat = makeSeat({
		snapshot: { current: { provider: "deepseek-official", model: "plain" } }
	}, "no-reasoning", React, Seat);
	const opened = seat.open();
	equal(findSlider(opened), undefined, "no slider");
	assert(textOf(opened).includes("当前模型不提供推理等级。"), "unsupported note");
	const level = byClass(opened, "cep-level")[0];
	equal(level.props.disabled, true, "the level control is inert");
	equal(byClass(opened, "cep-reset")[0].props.disabled, true, "the reset is inert");
});

await check("a pending selection turns the reset slot into a spinner", () => {
	const seat = makeSeat({
		snapshot: { pending: { provider: "deepseek-account", model: "deepseek-v4-pro", reasoningEffort: "low" } }
	}, "pending", React, Seat);
	const trigger = findTrigger(seat.render());
	equal(trigger.props["aria-busy"], true, "aria-busy");
	equal(byClass(trigger, "cep-spinner").length, 1, "trigger spinner");
	const opened = seat.open();
	const slot = byClass(opened, "cep-reset")[0];
	equal(slot.props["data-busy"], "", "the reset slot is the busy slot");
	equal(byClass(slot, "cep-spinner").length, 1, "side spinner");
});

await check("a rejected effort write stays in the slab", async () => {
	const seat = makeSeat({
		props: { select: () => Promise.resolve({ ok: false, error: { code: "session/writer-held", message: "held" } }) }
	}, "rejected", React, Seat);
	byClass(seat.open(), "cep-reset")[0].props.onClick();
	await Promise.resolve();
	await Promise.resolve();
	const alert = byClass(seat.render(), "cep-error")[0];
	assert(alert !== undefined, "error strip rendered");
	assert(textOf(alert).includes("其它实例"), "explains the writer-held case");
});

await check("a rejected model change re-opens the slab with the reason", async () => {
	const seat = makeSeat({
		props: { select: () => Promise.reject(new Error("network down")) }
	}, "rejected-model", React, Seat);
	let opened = seat.open();
	byClass(opened, "cep-modelBtn")[0].props.onClick();
	opened = seat.render();
	findItems(opened)[1].props.onClick();
	await Promise.resolve();
	await Promise.resolve();
	const again = seat.render();
	assert(findDialog(again) !== undefined, "the slab came back");
	const alert = byClass(again, "cep-error")[0];
	assert(alert !== undefined, "error strip rendered");
	assert(textOf(alert).includes("network down"), "carries the reason");
});

await check("a load failure is reported with a retry control", () => {
	const seat = makeSeat({
		snapshot: { current: null, groups: [], failures: [], status: "error", error: "boom", pending: null, retainedEffort: undefined, routable: null }
	}, "load-failure", React, Seat);
	const opened = seat.open();
	assert(textOf(opened).includes("模型目录加载失败"), "failure text");
	const retry = byClass(opened, "cep-retry")[0];
	assert(retry !== undefined, "retry control");
	retry.props.onClick();
	equal(seat.calls.load, 2, "retry asks the directory to load again");
});

await check("the slab keeps the composer's locked state", () => {
	const seat = makeSeat({ props: { locked: true } }, "locked", React, Seat);
	equal(findTrigger(seat.render()).props.disabled, true, "locked composer disables the seat");
});

await check("an unselected model reads as the trigger fallback", () => {
	const seat = makeSeat({
		snapshot: { current: null, status: "loading", groups: [], failures: [], pending: null, error: null, retainedEffort: undefined, routable: null }
	}, "loading", React, Seat);
	const trigger = findTrigger(seat.render());
	equal(trigger.props.title, "正在加载…", "loading label");
	equal(trigger.props["aria-busy"], false, "no pending selection");
});

await check("a removed provider falls back to the raw provider/model id", () => {
	const seat = makeSeat({
		snapshot: { current: { provider: "gone", model: "vanished", reasoningEffort: "high" }, groups: [], failures: [], status: "ready", pending: null, error: null, routable: false, retainedEffort: "High" }
	}, "removed", React, Seat);
	const trigger = findTrigger(seat.render());
	equal(trigger.props.title, "gone/vanished · High", "raw id with the retained effort caption");
});

/* ------------------------------------------------------------------ */

if (failures.length > 0) {
	console.error(`FAIL ${failures.length} / ${passed + failures.length}`);
	for (const failure of failures) console.error(`  - ${failure}`);
	for (const note of notes) console.error(`  note: ${note}`);
	process.exitCode = 1;
} else {
	console.log(`PASS ${passed} assertions`);
	for (const note of notes) console.log(`  note: ${note}`);
}
