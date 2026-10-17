/**
 * Build `preview/panel.html`: a dependency-free page that renders the picker's
 * real markup and its real stylesheet (extracted from `lib/client.js`, not
 * copied), so the look can be reviewed — and screenshotted — without
 * installing anything.
 *
 * Run: node preview/build-preview.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = dirname(here);
const source = readFileSync(join(root, "lib/client.js"), "utf8");

/** Pull the shipped stylesheet out of the bundle so the preview cannot drift. */
function extractCss(js) {
	const start = js.indexOf("var CSS =");
	const end = js.indexOf("var STYLE_TAG_ID");
	if (start === -1 || end === -1) throw new Error("could not locate the CSS block in lib/client.js");
	const expression = js.slice(start + "var CSS =".length, end).trim().replace(/;\s*$/, "");
	return new Function(`return (${expression})`)();
}

/** Pull the shipped bead stream out of the bundle, for the same reason. */
function extractDots(js) {
	const start = js.indexOf("function dotsFor(");
	const end = js.indexOf("/**", js.indexOf("function dotsFor(") + 10);
	if (start === -1 || end === -1) throw new Error("could not locate dotsFor() in lib/client.js");
	const body = js.slice(start, end).trim();
	const factory = new Function(`${body}\nreturn dotsFor;`);
	return factory();
}

const css = extractCss(source);
const dots = extractDots(source)(16);

/** The tokens the picker reads, at their shipped light and dark values. */
const themes = {
	light: {
		"--dsw-alias-label-primary": "#0f1115",
		"--dsw-alias-label-secondary": "#61666b",
		"--dsw-alias-label-tertiary": "#81858c",
		"--dsw-alias-label-caption": "#adb2b8",
		"--dsw-alias-label-dimmed": "#e1e5ee",
		"--dsw-alias-border-l1": "#0000000a",
		"--dsw-alias-border-l2": "#0000001a",
		"--dsw-alias-interactive-bg-hover": "#2631480f",
		"--dsw-alias-interactive-bg-hover-danger": "#ec13130d",
		"--dsw-alias-state-error-primary": "#ec1313",
		"--dsw-alias-state-business-primary": "#4176e6",
		"--dsw-menu-surface-fill": "#f8f9fa94",
		"--dsw-menu-backdrop-filter": "blur(40px) saturate(150%)",
		"--dsw-elevation-stroke": "0 0 0 .5px var(--dsw-elevation-stroke-color)",
		"--ce-page": "#eef1f6",
		"--ce-page-glow": "#ffffff",
		"--ce-composer": "#ffffff"
	},
	dark: {
		"--dsw-alias-label-primary": "#f9fafb",
		"--dsw-alias-label-secondary": "#cfd3d6",
		"--dsw-alias-label-tertiary": "#81858c",
		"--dsw-alias-label-caption": "#81858c",
		"--dsw-alias-label-dimmed": "#43454a",
		"--dsw-alias-border-l1": "#ffffff0f",
		"--dsw-alias-border-l2": "#ffffff1f",
		"--dsw-alias-interactive-bg-hover": "#ffffff14",
		"--dsw-alias-interactive-bg-hover-danger": "#f25a5a26",
		"--dsw-alias-state-error-primary": "#f25a5a",
		"--dsw-alias-state-business-primary": "#7aaaff",
		"--dsw-menu-surface-fill": "#43454a73",
		"--dsw-menu-backdrop-filter": "blur(40px) saturate(150%)",
		"--dsw-elevation-stroke": "0 0 0 .5px var(--dsw-elevation-stroke-color)",
		"--ce-page": "#111114",
		"--ce-page-glow": "#262031",
		"--ce-composer": "#1e1f24"
	}
};

const levels = ["Off", "Low", "High", "Max"];
const groups = [
	{ name: "DeepSeek 账号", models: ["DeepSeek-V41-Flash", "DeepSeek-V4-Pro"] },
	{ name: "DeepSeek", models: ["DeepSeek-V41-Flash", "DeepSeek-V4-Pro"] }
];

const bolt = (size) =>
	`<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M9.4 1 3.2 8.6c-.3.4 0 .9.5.9h2.9l-.7 4.9c-.1.6.7.9 1 .4l6.1-7.6c.3-.4 0-.9-.5-.9H9.6l.7-4.5c.1-.6-.6-.9-.9-.4Z"/></svg>`;
const chevron = `<svg class="cep-chevron" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3.5 6 4.5 4.5L12.5 6"/></svg>`;
const check = `<svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 8.5 3.2 3L13 4.8"/></svg>`;
const back = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9.5 3.5-4.5 4.5 4.5 4.5"/></svg>`;
const reset = `<svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 5.2A5.6 5.6 0 1 0 13.2 10"/><path d="M13.6 2.2v3.4h-3.4"/></svg>`;
const modelGlyph = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><path d="M2.5 4.5h11M2.5 11.5h11"/><circle cx="5.5" cy="4.5" r="1.6" fill="var(--cep-glyph-fill,#fff)"/><circle cx="10.5" cy="11.5" r="1.6" fill="var(--cep-glyph-fill,#fff)"/></svg>`;

const KNOB = 44;
const pos = (index) => (levels.length <= 1 ? 0 : index / (levels.length - 1));
const pctStyle = (fraction, inset) => `style="--cep-pct:${fraction.toFixed(4)};--cep-inset:${inset}px"`;

function beadMarkup() {
	const base = 6.4;
	return dots
		.map(
			(bead) =>
				`<span class="cep-bead" style="top:${bead.top}%;width:${bead.size}px;height:${bead.size}px;opacity:${bead.opacity};animation-delay:${(base * bead.phase).toFixed(2)}s;animation-duration:${(base * bead.stretch).toFixed(2)}s"></span>`
		)
		.join("");
}

function ticksMarkup() {
	return levels.map((_, i) => `<span class="cep-tick" ${pctStyle(pos(i), KNOB)}></span>`).join("");
}

function headMarkup(index, burn) {
	const titles = burn
		? `<div class="cep-titles"><div class="cep-burn">更快消耗使用额度</div></div>`
		: `<div class="cep-titles">
				<button type="button" class="cep-level" data-preview-level>${levels[index]}<span class="cep-levelChev" aria-hidden="true">›</span></button>
				<button type="button" class="cep-modelBtn" data-preview-model>DeepSeek-V41-Flash</button>
			</div>`;
	return `
			<div class="cep-head">
				<span class="cep-boltWrap">
					<button type="button" class="cep-boltBtn" data-preview-bolt title="2x speed · 用量更多" aria-label="2x speed · 用量更多">${bolt(19)}</button>
					<span class="cep-tip" aria-hidden="true"><span class="cep-tipTitle">2x speed</span><span class="cep-tipMore">用量更多</span></span>
				</span>
				${titles}
				<button type="button" class="cep-reset" title="重置为 Off" aria-label="重置为 Off" data-preview-reset>${reset}</button>
			</div>`;
}

function sliderMarkup(index) {
	return `
			<div class="cep-slider" role="slider" tabindex="0" aria-label="推理等级" aria-valuemin="0" aria-valuemax="${levels.length - 1}" aria-valuenow="${index}" aria-valuetext="${levels[index]}" data-preview-slider>
				<div class="cep-track">
					${ticksMarkup()}
					<div class="cep-fill" data-preview-fill ${pctStyle(pos(index), KNOB)}>
						<span class="cep-fillGlow" aria-hidden="true"></span>
						${beadMarkup()}
					</div>
				</div>
				<div class="cep-knob" data-preview-knob ${pctStyle(pos(index), KNOB)}></div>
			</div>`;
}

function listMarkup() {
	const rows = groups
		.map((group, gi) => {
			const items = group.models
				.map(
					(name, mi) =>
						`<button type="button" role="menuitemradio" aria-checked="${gi === 0 && mi === 0}" data-cep-item class="cep-item"><span class="cep-dot" aria-hidden="true">${gi === 0 && mi === 0 ? check : ""}</span><span class="cep-itemName">${name}</span></button>`
				)
				.join("");
			return `<div class="cep-group" role="group" aria-label="${group.name}"><div class="cep-groupTitle">${group.name}</div>${items}</div>`;
		})
		.join("");
	return `
			<div class="cep-listHead">
				<button type="button" class="cep-back" title="返回" aria-label="返回" data-preview-back>${back}</button>
				<span class="cep-listTitle">选择模型</span>
				<span class="cep-reset" aria-hidden="true"></span>
			</div>
			<div class="cep-items" role="menu">${rows}</div>`;
}

function panelMarkup(config) {
	const inner =
		config.view === "models" ? listMarkup() : headMarkup(config.index, config.burn === true) + sliderMarkup(config.index);
	const top = config.index === levels.length - 1 ? ' data-top=""' : "";
	const tokens = `--cep-blend:${config.blend === undefined ? (top ? "100%" : "0%") : config.blend}`;
	return `<div class="cep-panel" role="dialog" aria-label="推理等级" tabindex="-1" data-preview-panel data-view="${config.view}" data-index="${config.index}" data-burn="${config.burn === true ? "1" : "0"}"${top} style="${tokens}"><div class="cep-view">${inner}</div></div>`;
}

function stageMarkup(config) {
	return `
	<div class="stage" data-theme="${config.theme}"${config.pinned ? ' data-pinned="true"' : ""} style="${Object.entries(themes[config.theme])
		.map(([name, value]) => `${name}:${value}`)
		.join(";")}">
		<div class="stage-bg" aria-hidden="true"></div>
		<div class="stage-note">${config.caption}<button type="button" class="stage-replay" data-preview-replay title="重播开启动画">▶ 重播</button></div>
		${panelMarkup(config)}
		<div class="composer" aria-hidden="true">
			<button type="button" class="cep-trigger" aria-haspopup="dialog" aria-expanded="true"${config.index === levels.length - 1 ? ' data-top=""' : ""}>
				<span class="cep-triggerIcon" aria-hidden="true">${modelGlyph}</span>
				<span class="cep-triggerLabel">DeepSeek-V41-Flash</span>
				<span class="cep-triggerDot" aria-hidden="true">·</span>
				<span class="cep-triggerEffort">${levels[config.index]}</span>
				${chevron}
			</button>
			<span class="composer-gap"></span>
			<button class="composer-send" aria-hidden="true">↑</button>
		</div>
	</div>`;
}

const stages = [
	{ theme: "dark", index: 2, view: "slider", caption: "深色 · High（每档一枚实心圆点）" },
	{ theme: "dark", index: 3, view: "slider", burn: true, caption: "深色 · 拖到顶未松手：「更快消耗使用额度」" },
	{ theme: "light", index: 0, view: "slider", pinned: true, caption: "浅色 · Off（悬停闪电的 2x speed 气泡）" },
	{ theme: "light", index: 2, view: "models", caption: "浅色 · 模型列表（点模型名进入，淡入）" }
];

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>dsh-claude-effort-picker · 预览</title>
<style>
/* Page chrome only — every .cep-* rule below is the plugin's shipped CSS. */
*{box-sizing:border-box}
html,body{margin:0}
body{font-family:"Segoe UI","PingFang SC","Microsoft YaHei",system-ui,-apple-system,sans-serif;background:#0b0c11}
.page{padding:26px}
.page-title{color:#e8ecf5;font-size:15px;font-weight:600;margin:0 0 4px}
.page-hint{color:#8b93a5;font-size:12px;margin:0 0 20px;line-height:18px}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}
.stage{position:relative;height:430px;border-radius:20px;overflow:hidden;isolation:isolate;background:var(--ce-page);display:flex;flex-direction:column;justify-content:flex-end;padding:16px}
.stage-bg{position:absolute;inset:0;background:
  radial-gradient(120% 80% at 8% 100%, var(--ce-page-glow) 0%, transparent 55%),
  radial-gradient(90% 70% at 100% 8%, var(--ce-page-glow) 0%, transparent 60%)}
.stage-note{position:absolute;left:16px;top:14px;right:16px;display:flex;align-items:center;gap:8px;font-size:12px;color:var(--dsw-alias-label-caption);letter-spacing:.01em}
.stage-replay{flex:none;margin-left:auto;padding:3px 8px;border:1px solid var(--dsw-alias-border-l2);border-radius:999px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;cursor:pointer}
.stage-replay:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.stage .cep-panel{position:relative;left:auto;top:auto;width:100%;max-width:none;margin:0 0 14px;animation:none}
.stage[data-pinned="true"] .cep-tip{opacity:1;transform:none}
.composer{position:relative;display:flex;align-items:center;gap:8px}
.composer-gap{flex:1 1 auto}
.composer-send{flex:none;width:30px;height:30px;border:none;border-radius:10px;background:var(--dsw-alias-state-business-primary);color:#fff;font-size:14px;cursor:default}
.stage .cep-trigger{max-width:none}
</style>
<style>${css}</style>
</head>
<body>
<div class="page">
	<h1 class="page-title">dsh-claude-effort-picker</h1>
	<p class="page-hint">拖动滑条、按 ← →、点重置、点档位名或模型名 —— 都是真的交互；样式取自 <code>lib/client.js</code> 的同一份 CSS。</p>
	<div class="grid">${stages.map(stageMarkup).join("\n")}</div>
</div>
<script>
(function () {
	var KNOB = ${KNOB};
	var LEVELS = ${JSON.stringify(levels)};
	document.querySelectorAll("[data-preview-panel]").forEach(function (panel) {
		var mode = panel.getAttribute("data-view");
		if (mode !== "slider") return;
		var stage = panel.parentNode;
		var trigger = stage.querySelector(".cep-trigger");
		var slider = panel.querySelector("[data-preview-slider]");
		var fill = panel.querySelector("[data-preview-fill]");
		var knob = panel.querySelector("[data-preview-knob]");
		var titles = panel.querySelector(".cep-titles");
		var levelBtn = panel.querySelector("[data-preview-level]");
		var count = LEVELS.length;
		var index = Number(panel.getAttribute("data-index"));
		var dragging = null;
		var burnTimer = 0;
		var heightTimer = 0;
		var lastHeight = null;

		function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
		function positionOf(i) { return count <= 1 ? 0 : i / (count - 1); }
		function snap(v) { return count <= 1 ? 0 : Math.max(0, Math.min(count - 1, Math.round(clamp01(v) * (count - 1)))); }

		/* The header swaps with the same fade the plugin uses for its views. */
		function setTitles(html) {
			if (titles === null) return;
			titles.innerHTML = html;
			titles.classList.remove("cep-swap");
			void titles.offsetWidth;
			titles.classList.add("cep-swap");
		}

		/* Height morphs from what the card had to what it now needs. */
		function morphHeight() {
			if (lastHeight === null) {
				lastHeight = panel.offsetHeight;
				return;
			}
			panel.style.height = "auto";
			var natural = panel.offsetHeight;
			if (Math.abs(natural - lastHeight) < 1) {
				panel.style.height = "";
				lastHeight = natural;
				return;
			}
			panel.style.height = lastHeight + "px";
			void panel.offsetHeight;
			panel.style.height = natural + "px";
			panel.setAttribute("data-resizing", "");
			clearTimeout(heightTimer);
			heightTimer = setTimeout(function () {
				panel.style.height = "";
				panel.removeAttribute("data-resizing");
				lastHeight = natural;
			}, 320);
		}

		function titlesFor(at, burn) {
			if (burn) return '<div class="cep-burn">更快消耗使用额度</div>';
			return '<button type="button" class="cep-level" data-preview-level>' + LEVELS[at] +
				'<span class="cep-levelChev" aria-hidden="true">›</span></button>' +
				'<button type="button" class="cep-modelBtn" data-preview-model>DeepSeek-V41-Flash</button>';
		}

		function blendAt(position) {
			var from = count <= 1 ? 1 : (count - 2) / (count - 1);
			if (!(position > from)) return 0;
			return clamp01((position - from) / (1 - from));
		}
		function flowAt(top) {
			var boltBtn = panel.querySelector("[data-preview-bolt]");
			var boltOn = boltBtn !== null && boltBtn.hasAttribute("data-on");
			return 1 + (top ? 0.5 : 0) + (boltOn ? 0.5 : 0);
		}
		/* Speed goes on the running animations, so switching 1x/1.5x/2x never restarts the stream. */
		function applyFlow(speed) {
			panel.querySelectorAll(".cep-bead").forEach(function (bead) {
				(bead.getAnimations ? bead.getAnimations() : []).forEach(function (animation) {
					try {
						if (typeof animation.updatePlaybackRate === "function") animation.updatePlaybackRate(speed);
						else animation.playbackRate = speed;
					} catch (error) {}
				});
			});
		}

		function paint(at, burn) {
			var position = positionOf(at);
			if (fill !== null) fill.style.setProperty("--cep-pct", String(position));
			if (knob !== null) knob.style.setProperty("--cep-pct", String(position));
			if (slider !== null) {
				slider.setAttribute("aria-valuenow", String(at));
				slider.setAttribute("aria-valuetext", LEVELS[at]);
			}
			/* Below the top stop everything is blue; only the last segment blends into violet. */
			var top = at === count - 1;
			panel.style.setProperty("--cep-blend", Math.round(blendAt(position) * 100) + "%");
			applyFlow(flowAt(top));
			if (panel !== null) {
				if (top) panel.setAttribute("data-top", "");
				else panel.removeAttribute("data-top");
			}
			if (trigger !== null) {
				if (top) trigger.setAttribute("data-top", "");
				else trigger.removeAttribute("data-top");
			}
			setTitles(titlesFor(at, burn === true));
			morphHeight();
			if (trigger !== null) {
				var effort = trigger.querySelector(".cep-triggerEffort");
				if (effort !== null) effort.textContent = LEVELS[at];
			}
			var nextLevel = panel.querySelector("[data-preview-level]");
			if (nextLevel !== null) {
				nextLevel.addEventListener("click", function () {
					index = (index + 1) % count;
					paint(index, false);
				});
			}
			var nextModel = panel.querySelector("[data-preview-model]");
			if (nextModel !== null) {
				nextModel.addEventListener("click", function () {
					nextModel.textContent = nextModel.textContent === "DeepSeek-V41-Flash" ? "DeepSeek-V4-Pro" : "DeepSeek-V41-Flash";
				});
			}
		}

		function pointerPosition(clientX) {
			var rect = slider.getBoundingClientRect();
			var span = rect.width - KNOB;
			if (!(span > 0)) return 0;
			return clamp01((clientX - rect.left - KNOB / 2) / span);
		}

		slider.addEventListener("pointerdown", function (event) {
			if (event.button > 0) return;
			event.preventDefault();
			slider.focus();
			dragging = pointerPosition(event.clientX);
			slider.setAttribute("data-drag", "");
			if (fill !== null) fill.style.setProperty("--cep-pct", String(dragging));
			if (knob !== null) knob.style.setProperty("--cep-pct", String(dragging));
			paint(snap(dragging), snap(dragging) === count - 1);
			try { slider.setPointerCapture(event.pointerId); } catch (error) {}
		});
		slider.addEventListener("pointermove", function (event) {
			if (dragging === null) return;
			dragging = pointerPosition(event.clientX);
			if (fill !== null) fill.style.setProperty("--cep-pct", String(dragging));
			if (knob !== null) knob.style.setProperty("--cep-pct", String(dragging));
			panel.style.setProperty("--cep-blend", Math.round(blendAt(dragging) * 100) + "%");
			var at = snap(dragging);
			applyFlow(flowAt(at === count - 1));
			setTitles(titlesFor(at, at === count - 1));
			morphHeight();
		});
		slider.addEventListener("pointerup", function (event) {
			if (dragging === null) return;
			var released = dragging;
			dragging = null;
			slider.removeAttribute("data-drag");
			try { slider.releasePointerCapture(event.pointerId); } catch (error) {}
			index = snap(released);
			paint(index, index === count - 1);
			if (index === count - 1) {
				clearTimeout(burnTimer);
				burnTimer = setTimeout(function () { paint(index, false); }, 1200);
			}
		});
		slider.addEventListener("pointercancel", function () {
			dragging = null;
			slider.removeAttribute("data-drag");
			paint(index, false);
		});
		slider.addEventListener("keydown", function (event) {
			var next = null;
			if (event.key === "ArrowLeft" || event.key === "ArrowDown") next = Math.max(0, index - 1);
			if (event.key === "ArrowRight" || event.key === "ArrowUp") next = Math.min(count - 1, index + 1);
			if (event.key === "Home") next = 0;
			if (event.key === "End") next = count - 1;
			if (next === null) return;
			event.preventDefault();
			index = next;
			paint(index, index === count - 1);
		});

		var resetBtn = panel.querySelector("[data-preview-reset]");
		if (resetBtn !== null) {
			resetBtn.addEventListener("click", function () {
				index = 0;
				paint(0, false);
			});
		}

		/* The bolt is a real button that only lights itself up and badges the pill. */
		var boltBtn = panel.querySelector("[data-preview-bolt]");
		if (boltBtn !== null) {
			boltBtn.addEventListener("click", function () {
				var on = boltBtn.toggleAttribute("data-on");
				boltBtn.setAttribute("aria-pressed", String(on));
				var pill = stage.querySelector(".cep-trigger");
				var badge = pill === null ? null : pill.querySelector(".cep-triggerBolt");
				if (on && badge === null && pill !== null) {
					badge = document.createElement("span");
					badge.className = "cep-triggerBolt";
					badge.setAttribute("aria-hidden", "true");
					badge.innerHTML = ${JSON.stringify(bolt(12))};
					var icon = pill.querySelector(".cep-triggerIcon");
					if (icon !== null) icon.insertAdjacentElement("afterend", badge);
					else pill.insertBefore(badge, pill.firstChild);
				} else if (!on && badge !== null) {
					badge.remove();
				}
			});
		}

		/* the click-to-cycle handler is (re)bound by paint() */
		paint(index, panel.getAttribute("data-burn") === "1");
	});

	document.querySelectorAll("[data-cep-item]").forEach(function (row) {
		row.addEventListener("click", function () {
			var panel = row.closest(".cep-panel");
			panel.querySelectorAll("[data-cep-item]").forEach(function (other) {
				other.setAttribute("aria-checked", "false");
				other.querySelector(".cep-dot").innerHTML = "";
			});
			row.setAttribute("aria-checked", "true");
			row.querySelector(".cep-dot").innerHTML = ${JSON.stringify(check)};
		});
	});

	/* Replay the unfold: stub height + the open animation, exactly as the card does it. */
	document.querySelectorAll("[data-preview-replay]").forEach(function (button) {
		button.addEventListener("click", function () {
			var panel = button.closest(".stage").querySelector(".cep-panel");
			if (panel === null) return;
			panel.style.height = "";
			var natural = panel.offsetHeight;
			panel.style.animation = "none";
			panel.style.height = "78px";
			void panel.offsetHeight;
			panel.style.animation = "";
			panel.style.height = natural + "px";
			setTimeout(function () { panel.style.height = ""; }, 320);
		});
	});
})();
</script>
</body>
</html>
`;

mkdirSync(here, { recursive: true });
writeFileSync(join(here, "panel.html"), html, "utf8");
console.log(`preview/panel.html written (${(html.length / 1024).toFixed(1)} KB, stylesheet ${(css.length / 1024).toFixed(1)} KB)`);
