/**
 * Copyright (C) 2026 eggypartyYYDS <yyds2458@outlook.com>
 * Licensed under the DSH-Claude-Effort-Picker Non-Commercial Attribution License 1.0
 * (see LICENSE): non-commercial use, attribution required; commercial use needs a
 * separate written license.
 *
 * dsh-claude-effort-picker — composer half (browser).
 *
 * Replaces the composer's model seat (`conversation.input.model`) with a
 * Claude-style effort slab: a rounded card above the composer holding a small
 * decorative bolt, the current level in the accent colour, the model under it,
 * a reset control on the right, and a fat capsule slider whose stops are
 * marked by one solid dot each.
 *
 * The seat registers at a negative priority because a `single` slot keeps one
 * occupant per priority and the lowest priority renders — the documented way
 * to shadow the shipped `ui-model-selection` seat without touching it.
 * Disabling this plugin restores that seat untouched.
 *
 * `/model` is redirected to the same card: the shipped contribution in
 * `commandUi` is a popupSelect list, so its `ui` face is swapped for an action
 * that asks the mounted seat to open itself.
 *
 * Data comes only from the official public faces: `ctx.modelDirectories`
 * (`directoryFor(sessionId).store` / `.select()`) and `ctx.sessions`. No Host
 * hook, no wire message, no mutation of the official model directory.
 */
window.__ModuleLoader__.load({
	id: "dsh-claude-effort-picker",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		var React = require("react");
		var reactDom = require("react-dom");
		var h = React.createElement;

		//#region locale
		/** Dictionary namespace owned by this plugin. */
		var NS = "claude-effort-picker";

		/** Simplified Chinese dictionary (the key-set source of truth). */
		var zh = {
			"panel.effort": "推理等级",
			"panel.models": "选择模型",
			"panel.back": "返回",
			"panel.loading": "正在加载模型目录…",
			"panel.empty": "没有可用的模型。",
			"panel.error": "模型目录加载失败：{message}",
			"panel.retry": "重试",
			"panel.defaultTag": "默认",
			"panel.reset": "重置为 Off",
			"panel.burn": "更快消耗使用额度",
			"search.placeholder": "搜索模型…",
			"search.aria": "筛选模型",
			"search.clear": "清除搜索",
			"search.empty": "没有匹配的模型。",
			"group.account": "DeepSeek 账号",
			"group.official": "DeepSeek",
			"fast.speed": "2x speed",
			"fast.more": "用量更多",
			"effort.default": "默认",
			"effort.unsupported": "当前模型不提供推理等级。",
			"effort.open": "选择推理等级，当前 {level}",
			"model.open": "选择模型，当前 {model}",
			"trigger.loading": "正在加载…",
			"trigger.fallback": "选择模型",
			"trigger.selectAria": "选择模型",
			"trigger.ariaModel": "选择模型，当前 {model}",
			"trigger.ariaEffort": "选择模型，当前 {model}，推理等级 {effort}",
			"error.selection": "切换失败：{message}",
			"error.sessionInUse": "会话正被其他 DSH 实例占用，请退出其它实例后重试。",
			"error.unknown": "未知错误"
		};

		/** English dictionary, kept complete against the zh key set. */
		var en = {
			"panel.effort": "Reasoning effort",
			"panel.models": "Select model",
			"panel.back": "Back",
			"panel.loading": "Loading the model catalog…",
			"panel.empty": "No models are available.",
			"panel.error": "The model catalog failed to load: {message}",
			"panel.retry": "Retry",
			"panel.defaultTag": "default",
			"panel.reset": "Reset to Off",
			"panel.burn": "Burns your quota faster",
			"search.placeholder": "Search models…",
			"search.aria": "Filter models",
			"search.clear": "Clear search",
			"search.empty": "No models match.",
			"group.account": "DeepSeek Account",
			"group.official": "DeepSeek",
			"fast.speed": "2x speed",
			"fast.more": "more usage",
			"effort.default": "default",
			"effort.unsupported": "This model advertises no reasoning levels.",
			"effort.open": "Choose the reasoning effort, currently {level}",
			"model.open": "Choose the model, currently {model}",
			"trigger.loading": "Loading…",
			"trigger.fallback": "Select model",
			"trigger.selectAria": "Select model",
			"trigger.ariaModel": "Select model, current {model}",
			"trigger.ariaEffort": "Select model, current {model}, reasoning effort {effort}",
			"error.selection": "The switch failed: {message}",
			"error.sessionInUse": "Another DSH instance owns this session; quit the other instances and retry.",
			"error.unknown": "unknown error"
		};
		//#endregion

		//#region styles
		/** Knob diameter in px; the track, the fill, the stop dots and the pointer mapping share it. */
		var KNOB = 44;
		/** Track height in px (the knob overlaps it, which is what gives the slab its weight). */
		var TRACK = 34;
		/** How long the "burn" hint stays after the knob is released on the top stop. */
		var BURN_HOLD_MS = 1200;
		/** Height the card unfolds from when it opens (iOS-menu feel), in px. */
		var OPEN_FROM_HEIGHT = 78;
		/** One bead crossing the filled track at 1x speed, in seconds. */
		var BEAD_BASE_SECONDS = 6.4;

		var CSS =
			/* Derived properties the trigger and the portaled panel both need, so they are declared on both roots instead of being inherited across the portal boundary. */
			".cep-root,.cep-panel{" +
			"--cep-accent:#8b5cf6;" +
			"--cep-accent-strong:color-mix(in srgb,var(--cep-accent) 72%,var(--dsw-alias-label-primary,#1b1c20));" +
			"--cep-accent-soft:color-mix(in srgb,var(--cep-accent) 18%,transparent);" +
			/* Below the top stop everything is blue; only the top stop turns violet. */
			"--cep-blue:#2f7cf6;" +
			"--cep-blue-strong:color-mix(in srgb,var(--cep-blue) 74%,var(--dsw-alias-label-primary,#1b1c20));" +
			/* Blend runs from the stop below the top (blue) to the top stop (violet). */
			"--cep-blend:0%;" +
			"--cep-tint:color-mix(in srgb,var(--cep-accent) var(--cep-blend),var(--cep-blue));" +
			"--cep-ring:var(--cep-tint);" +
			"--cep-cream:#f6f1e7;" +
			"--cep-hairline:var(--dsw-alias-border-l1,rgba(15,20,40,.1));" +
			"--cep-ink:var(--dsw-alias-label-primary,#1b1c20);" +
			"--cep-muted:var(--dsw-alias-label-secondary,#5c6270);" +
			"--cep-caption:var(--dsw-alias-label-caption,#8a90a0)" +
			"}" +
			/* The top stop is the only state where the composer pill's effort label turns violet. */
			".cep-trigger[data-top]{--cep-ring:var(--cep-accent)}" +
			/* ---- trigger pill ---- */
			".cep-root{position:relative;min-width:0}" +
			".cep-trigger{display:flex;align-items:center;gap:6px;min-width:0;max-width:min(320px,45cqw);height:28px;padding:0 7px 0 9px;border:none;border-radius:999px;background:color-mix(in srgb,var(--cep-ink) 7%,transparent);color:var(--cep-muted);font-size:13px;line-height:20px;font-weight:400;cursor:pointer;outline:none;transition:background .12s ease}" +
			".cep-trigger:hover:not(:disabled){background:color-mix(in srgb,var(--cep-ink) 11%,transparent)}" +
			".cep-trigger:focus-visible{box-shadow:0 0 0 2px var(--dsw-focus-ring-color,var(--cep-accent))}" +
			".cep-trigger:disabled{opacity:.5;cursor:default}" +
			".cep-triggerIcon{display:var(--dsh-composer-model-icon-display,none);flex:none;color:var(--cep-muted)}" +
			".cep-triggerLabel{display:var(--dsh-composer-model-text-display,block);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
			".cep-triggerDot{display:var(--dsh-composer-model-text-display,block);flex:none;color:var(--cep-caption)}" +
			".cep-triggerEffort{display:var(--dsh-composer-model-text-display,block);flex:none;font-weight:600;color:var(--cep-muted);max-width:96px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;transition:color .18s ease}" +
			".cep-trigger[data-top] .cep-triggerEffort{color:var(--cep-accent-strong)}" +
			".cep-chevron{flex:none;color:var(--cep-caption);transition:transform .12s ease}" +
			".cep-chevronOpen{transform:rotate(180deg)}" +
			".cep-spinner{display:inline-block;flex:none;width:12px;height:12px;border-radius:50%;border:1.5px solid var(--cep-caption);border-top-color:transparent;animation:cep-spin .7s linear infinite}" +
			"@keyframes cep-spin{to{transform:rotate(360deg)}}" +
			/* ---- slab ---- */
			".cep-panel{position:fixed;z-index:1200;display:flex;flex-direction:column;box-sizing:border-box;width:420px;max-width:calc(100vw - 24px);padding:12px 14px 14px;border-radius:26px;background:var(--dsw-menu-surface-fill,#f8f9fa94);backdrop-filter:var(--dsw-menu-backdrop-filter,blur(40px) saturate(150%));-webkit-backdrop-filter:var(--dsw-menu-backdrop-filter,blur(40px) saturate(150%));--dsw-elevation-stroke-color:var(--cep-hairline);box-shadow:inset 0 1px 0 color-mix(in srgb,var(--cep-ink) 4%,transparent),inset 0 0 0 1px color-mix(in srgb,var(--cep-ink) 5%,transparent),var(--dsw-elevation-stroke),0 22px 56px rgba(8,10,24,.34);color:var(--cep-ink);font-size:13px;line-height:20px;transform-origin:right bottom;transition:height .26s cubic-bezier(.22,.85,.28,1),opacity .16s ease;animation:cep-open .38s cubic-bezier(.17,.86,.28,1.03) both}" +
			".cep-panel[data-resizing]{overflow:hidden}" +
			/* Unfolds from the composer corner and grows into its height, iOS-menu style. */
			"@keyframes cep-open{0%{opacity:0;transform:translateY(16px) scale(.8)}55%{opacity:1}100%{opacity:1;transform:none}}" +
			".cep-panel:focus{outline:none}" +
			/* every view fades in instead of snapping into place */
			".cep-view{display:flex;flex-direction:column;gap:10px;animation:cep-viewIn .22s cubic-bezier(.22,.85,.28,1)}" +
			"@keyframes cep-viewIn{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}" +
			/* the header content swaps with the same fade (burn hint <-> level + model) */
			".cep-swap{animation:cep-viewIn .22s cubic-bezier(.22,.85,.28,1)}" +
			/* ---- head: decorative bolt / titles / reset ---- */
			".cep-head{display:flex;align-items:flex-start;gap:6px}" +
			".cep-boltWrap{position:relative;flex:none;display:grid;place-items:center;width:28px;height:28px;margin-top:1px;color:var(--cep-accent)}" +
			".cep-boltBtn{display:grid;place-items:center;width:28px;height:28px;padding:0;border:none;border-radius:9px;background:transparent;color:inherit;cursor:pointer;outline:none;transition:background .12s ease,transform .18s cubic-bezier(.22,.85,.28,1),filter .18s ease}" +
			".cep-boltBtn:hover{background:color-mix(in srgb,var(--cep-accent) 14%,transparent);transform:translateY(-1px) scale(1.06);filter:drop-shadow(0 3px 8px color-mix(in srgb,var(--cep-accent) 55%,transparent))}" +
			".cep-boltBtn:active{transform:scale(.92)}" +
			".cep-boltBtn:focus-visible{box-shadow:0 0 0 2px var(--dsw-focus-ring-color,var(--cep-accent))}" +
			/* Pressed look: the bolt lights up and the composer pill gains its badge. Purely visual. */
			".cep-boltBtn[data-on]{background:linear-gradient(150deg,#8b5cf6,#6d3ff0);color:#fff;box-shadow:0 6px 18px color-mix(in srgb,var(--cep-accent) 46%,transparent)}" +
			".cep-triggerBolt{display:var(--dsh-composer-model-text-display,inline-flex);align-items:center;justify-content:center;flex:none;color:var(--cep-accent)}" +
			".cep-tip{position:absolute;left:-8px;bottom:calc(100% + 10px);z-index:3;display:flex;flex-direction:column;gap:1px;min-width:126px;padding:9px 13px 10px;border-radius:16px;background:rgba(27,27,31,.95);box-shadow:0 14px 34px rgba(0,0,0,.4);color:#fff;opacity:0;transform:translateY(5px) scale(.98);transform-origin:left bottom;transition:opacity .16s ease,transform .16s cubic-bezier(.22,.85,.28,1);pointer-events:none}" +
			".cep-boltWrap:hover .cep-tip,.cep-boltWrap:focus-within .cep-tip{opacity:1;transform:none}" +
			".cep-tipTitle{font-size:17px;font-weight:700;line-height:22px;letter-spacing:-.01em}" +
			".cep-tipMore{font-size:13px;line-height:19px;color:rgba(255,255,255,.74)}" +
			".cep-titles{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;align-items:center;gap:1px;text-align:center;padding-top:2px}" +
			".cep-level{display:inline-flex;align-items:center;gap:5px;max-width:100%;padding:0;border:none;background:transparent;color:color-mix(in srgb,var(--cep-accent-strong) var(--cep-blend),var(--cep-blue-strong));font:inherit;font-size:22px;font-weight:700;line-height:27px;letter-spacing:-.01em;cursor:pointer;outline:none;border-radius:8px;transition:color .2s ease}" +
			".cep-level:hover .cep-levelChev{transform:translateX(2px)}" +
			".cep-level:focus-visible{box-shadow:0 0 0 2px var(--dsw-focus-ring-color,var(--cep-accent))}" +
			".cep-levelText{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
			".cep-levelChev{font-size:16px;line-height:1;opacity:.7;transition:transform .12s ease}" +
			".cep-modelBtn{max-width:100%;padding:0;border:none;background:transparent;color:var(--cep-muted);font:inherit;font-size:13px;line-height:18px;cursor:pointer;outline:none;border-radius:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
			".cep-modelBtn:hover{color:var(--cep-ink)}" +
			".cep-modelBtn:focus-visible{box-shadow:0 0 0 2px var(--dsw-focus-ring-color,var(--cep-accent))}" +
			".cep-burn{margin-top:1px;color:var(--cep-accent-strong);font-size:16px;font-weight:700;line-height:24px;letter-spacing:.01em}" +
			".cep-reset{flex:none;display:grid;place-items:center;width:28px;height:28px;margin-top:1px;padding:0;border:none;border-radius:9px;background:transparent;color:var(--cep-caption);cursor:pointer;outline:none;transition:background .12s ease,color .12s ease,transform .18s cubic-bezier(.22,.85,.28,1)}" +
			".cep-reset:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(15,20,40,.06));color:var(--cep-ink)}" +
			".cep-reset:active:not(:disabled){transform:rotate(-40deg)}" +
			".cep-reset:disabled{opacity:.4;cursor:default}" +
			/* ---- slider ---- */
			".cep-slider{position:relative;display:flex;align-items:center;height:44px;margin-top:-2px;cursor:pointer;outline:none;touch-action:none;-webkit-user-select:none;user-select:none}" +
			".cep-track{position:relative;width:100%;height:34px;border-radius:999px;overflow:hidden;background:color-mix(in srgb,var(--cep-ink) 9%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--cep-ink) 6%,transparent),inset 0 2px 8px rgba(10,12,26,.08)}" +
			".cep-tick{position:absolute;top:50%;left:calc(var(--cep-inset,44px) / 2 + (100% - var(--cep-inset,44px)) * var(--cep-pct,0));width:7px;height:7px;margin:-3.5px 0 0 -3.5px;border-radius:50%;background:color-mix(in srgb,var(--cep-ink) 26%,transparent)}" +
			".cep-fill{position:absolute;left:0;top:0;bottom:0;width:calc(var(--cep-inset,44px) / 2 + (100% - var(--cep-inset,44px)) * var(--cep-pct,0));border-radius:999px;overflow:hidden;background:linear-gradient(90deg,#3f7bfd 0%,color-mix(in srgb,var(--cep-accent) var(--cep-blend),#3b62ef) 100%);box-shadow:0 6px 20px -6px color-mix(in srgb,var(--cep-tint) 62%,transparent);transition:width .2s cubic-bezier(.22,.85,.28,1),background .2s ease,box-shadow .2s ease}" +
			".cep-fillGlow{position:absolute;inset:0;background:linear-gradient(180deg,rgba(255,255,255,.24),rgba(255,255,255,0) 58%);pointer-events:none}" +
			/* Only beads: irregular dots drifting rightwards across the filled part. The
			 * duration is fixed; speed is applied to the running animations (playbackRate),
			 * so switching 1x/1.5x/2x accelerates the stream instead of restarting it. */
			".cep-bead{position:absolute;top:0;left:-10%;border-radius:50%;background:#fff;pointer-events:none;animation-name:cep-flow;animation-timing-function:linear;animation-iteration-count:infinite;animation-duration:6.4s;will-change:left}" +
			"@keyframes cep-flow{from{left:-10%}to{left:110%}}" +
			".cep-knob{position:absolute;top:50%;left:calc(var(--cep-inset,44px) / 2 + (100% - var(--cep-inset,44px)) * var(--cep-pct,0));width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;background:radial-gradient(120% 120% at 32% 28%,#fffdf7,var(--cep-cream) 62%,#e9e1d2 100%);box-shadow:0 8px 20px rgba(8,10,24,.32),inset 0 0 0 1.5px var(--cep-ring);z-index:2;transition:left .2s cubic-bezier(.22,.85,.28,1),transform .12s ease,box-shadow .12s ease,background .18s ease}" +
			".cep-slider[data-drag] .cep-fill,.cep-slider[data-drag] .cep-knob{transition:none}" +
			".cep-slider[data-drag] .cep-knob{transform:scale(1.05);box-shadow:0 10px 26px rgba(8,10,24,.42),inset 0 0 0 2px var(--cep-ring)}" +
			".cep-slider:focus-visible .cep-knob{box-shadow:0 0 0 3px color-mix(in srgb,var(--cep-accent) 60%,transparent),0 8px 20px rgba(8,10,24,.32)}" +
			/* ---- list mode ---- */
			".cep-listHead{display:flex;align-items:center;gap:8px;min-height:30px}" +
			".cep-back{display:grid;place-items:center;flex:none;width:28px;height:28px;padding:0;border:none;border-radius:9px;background:transparent;color:var(--cep-muted);cursor:pointer;outline:none}" +
			".cep-back:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(15,20,40,.06));color:var(--cep-ink)}" +
			".cep-listTitle{flex:1 1 auto;font-size:14px;font-weight:600;color:var(--cep-ink)}" +
			".cep-searchRow{display:flex;align-items:center;gap:6px;height:32px;padding:0 10px;border-radius:999px;background:color-mix(in srgb,var(--cep-ink) 6%,transparent)}" +
			".cep-search{flex:1 1 auto;min-width:0;height:100%;border:none;background:transparent;color:var(--cep-ink);font:inherit;font-size:13px;outline:none;padding:0}" +
			".cep-search::placeholder{color:var(--cep-caption)}" +
			".cep-searchClear{display:inline-flex;align-items:center;justify-content:center;flex:none;width:18px;height:18px;padding:0;border:none;border-radius:50%;background:transparent;color:var(--cep-caption);cursor:pointer}" +
			".cep-items{display:flex;flex-direction:column;gap:2px;min-height:0;max-height:min(268px,40vh);overflow:auto;scrollbar-width:thin}" +
			".cep-groupTitle{padding:8px 12px 2px;font-size:11px;font-weight:500;line-height:16px;color:var(--cep-caption)}" +
			".cep-item{display:flex;align-items:center;gap:10px;width:100%;min-height:40px;padding:4px 12px;border:none;border-radius:14px;background:transparent;color:var(--cep-ink);font:inherit;font-size:14px;line-height:20px;text-align:left;cursor:pointer;outline:none}" +
			".cep-item:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(15,20,40,.06))}" +
			".cep-item:focus-visible{box-shadow:inset 0 0 0 1.5px var(--dsw-focus-ring-color,var(--cep-accent))}" +
			".cep-item[aria-checked=true]{background:var(--cep-accent-soft)}" +
			".cep-dot{display:inline-flex;align-items:center;justify-content:center;flex:none;width:16px;height:16px;border-radius:50%;border:1.5px solid var(--dsw-alias-border-l2,rgba(15,20,40,.24));color:#fff}" +
			".cep-item[aria-checked=true] .cep-dot{border-color:var(--cep-accent);background:var(--cep-accent)}" +
			".cep-itemName{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
			".cep-itemTag{flex:none;font-size:11px;color:var(--cep-caption)}" +
			".cep-note{padding:10px 12px;font-size:12.5px;line-height:18px;color:var(--dsw-alias-label-tertiary,#9aa0a6)}" +
			".cep-noteError{padding:9px 12px;border-radius:14px;background:var(--dsw-alias-interactive-bg-hover-danger,rgba(220,60,60,.1));color:var(--dsw-alias-state-error-primary,#c8342b);font-size:12.5px;line-height:18px}" +
			".cep-retry{margin-left:6px;border:none;border-radius:6px;background:transparent;color:inherit;font:inherit;font-weight:600;cursor:pointer;text-decoration:underline}" +
			".cep-error{padding:8px 12px;border-radius:14px;background:var(--dsw-alias-interactive-bg-hover-danger,rgba(220,60,60,.1));color:var(--dsw-alias-state-error-primary,#c8342b);font-size:12px;line-height:18px}" +
			"@media (prefers-reduced-motion:reduce){.cep-panel,.cep-view{animation:none}.cep-panel{transition:opacity .12s ease}.cep-knob,.cep-fill,.cep-boltBtn,.cep-reset,.cep-level{transition:none}.cep-bead{animation:none;left:50%;opacity:.6}.cep-spinner{animation-duration:2s}.cep-burn{animation:none}}";

		var STYLE_TAG_ID = "dsh-claude-effort-picker/picker.css";

		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(STYLE_TAG_ID) + "]") === null) {
			var styleTag = document.createElement("style");
			styleTag.dataset.plugin = "dsh-claude-effort-picker";
			styleTag.dataset.pluginCss = STYLE_TAG_ID;
			styleTag.textContent = CSS;
			document.head.appendChild(styleTag);
		}
		//#endregion

		//#region glyphs
		function LightningGlyph(props) {
			var size = props.size === undefined ? 18 : props.size;
			return h("svg", {
				width: size,
				height: size,
				viewBox: "0 0 16 16",
				fill: "currentColor",
				"aria-hidden": "true",
				focusable: "false"
			}, h("path", { d: "M9.4 1 3.2 8.6c-.3.4 0 .9.5.9h2.9l-.7 4.9c-.1.6.7.9 1 .4l6.1-7.6c.3-.4 0-.9-.5-.9H9.6l.7-4.5c.1-.6-.6-.9-.9-.4Z" }));
		}
		function ChevronGlyph(props) {
			return h("svg", {
				width: props.size === undefined ? 12 : props.size,
				height: props.size === undefined ? 12 : props.size,
				viewBox: "0 0 16 16",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: 1.6,
				strokeLinecap: "round",
				strokeLinejoin: "round",
				"aria-hidden": "true",
				focusable: "false",
				className: props.className
			}, h("path", { d: "m3.5 6 4.5 4.5L12.5 6" }));
		}
		function CheckGlyph() {
			return h("svg", {
				width: 9,
				height: 9,
				viewBox: "0 0 16 16",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: 2.6,
				strokeLinecap: "round",
				strokeLinejoin: "round",
				"aria-hidden": "true",
				focusable: "false"
			}, h("path", { d: "m3 8.5 3.2 3L13 4.8" }));
		}
		function CloseGlyph() {
			return h("svg", {
				width: 10,
				height: 10,
				viewBox: "0 0 16 16",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: 1.8,
				strokeLinecap: "round",
				"aria-hidden": "true",
				focusable: "false"
			}, h("path", { d: "m4 4 8 8M12 4l-8 8" }));
		}
		function BackGlyph() {
			return h("svg", {
				width: 14,
				height: 14,
				viewBox: "0 0 16 16",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: 1.7,
				strokeLinecap: "round",
				strokeLinejoin: "round",
				"aria-hidden": "true",
				focusable: "false"
			}, h("path", { d: "m9.5 3.5-4.5 4.5 4.5 4.5" }));
		}
		function ResetGlyph() {
			return h("svg", {
				width: 17,
				height: 17,
				viewBox: "0 0 16 16",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: 1.5,
				strokeLinecap: "round",
				strokeLinejoin: "round",
				"aria-hidden": "true",
				focusable: "false"
			},
				h("path", { d: "M13 5.2A5.6 5.6 0 1 0 13.2 10" }),
				h("path", { d: "M13.6 2.2v3.4h-3.4" })
			);
		}
		/**
		 * The compact stand-in for the seat's text: the composer hides the text
		 * share (`--dsh-composer-model-text-display: none`) and shows this share
		 * instead when the expanded controls cannot share one line.
		 */
		function ModelGlyph() {
			return h("svg", {
				width: 16,
				height: 16,
				viewBox: "0 0 16 16",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: 1.4,
				strokeLinecap: "round",
				"aria-hidden": "true",
				focusable: "false"
			},
				h("path", { d: "M2.5 4.5h11M2.5 11.5h11" }),
				h("circle", { cx: 5.5, cy: 4.5, r: 1.6, fill: "var(--cep-glyph-fill,#fff)" }),
				h("circle", { cx: 10.5, cy: 11.5, r: 1.6, fill: "var(--cep-glyph-fill,#fff)" })
			);
		}
		//#endregion

		//#region pure helpers
		/** Clamp to [0, 1]. */
		function clamp01(value) {
			return value < 0 ? 0 : value > 1 ? 1 : value;
		}
		/** Clamp to an integer range. */
		function clamp(value, min, max) {
			return value < min ? min : value > max ? max : value;
		}
		/**
		 * Whether a stop means "reasoning off".
		 * @param level - one advertised stop.
		 */
		function isOffLevel(level) {
			if (level === undefined || level === null) return false;
			var id = String(level.id === undefined ? "" : level.id).toLowerCase().trim();
			var name = String(level.name === undefined || level.name === null ? "" : level.name).toLowerCase().trim();
			return id === "off" || id === "none" || name === "off" || name === "关闭" || name === "无";
		}
		/**
		 * Normalize one model's advertised reasoning metadata into slider stops.
		 *
		 * The adapter owns the vocabulary and the order, so the list is kept as
		 * advertised. A model that advertises levels without a default gets an
		 * explicit leading "provider default" stop (effort `undefined`), which is
		 * exactly how the shipped seat offers it.
		 * @param reasoning - `{ defaultEffort?, efforts? }` from the catalog.
		 * @returns ordered stops; empty when the model advertises no levels.
		 */
		function effortLevelsOf(reasoning) {
			if (reasoning === undefined || reasoning === null || !Array.isArray(reasoning.efforts)) return [];
			var levels = [];
			for (var i = 0; i < reasoning.efforts.length; i += 1) {
				var raw = reasoning.efforts[i];
				if (raw === undefined || raw === null || typeof raw.id !== "string") continue;
				levels.push({ id: raw.id, name: typeof raw.name === "string" && raw.name.length > 0 ? raw.name : raw.id });
			}
			if (levels.length === 0) return [];
			if (reasoning.defaultEffort === undefined) levels.unshift({ id: undefined, name: null });
			return levels;
		}
		/**
		 * Position of an effort value among the stops.
		 * @param levels - ordered stops.
		 * @param effort - the value in `ModelSelection.reasoningEffort` (may be undefined).
		 * @returns the index, or -1 when the model no longer advertises that value.
		 */
		function levelIndexOf(levels, effort) {
			for (var i = 0; i < levels.length; i += 1) if (levels[i].id === effort) return i;
			return -1;
		}
		/**
		 * The stop the reset control goes to: the model's `Off` level, or its
		 * lowest level when the adapter advertises no Off.
		 * @param levels - ordered stops.
		 * @returns the index, or 0 when nothing matches.
		 */
		function resetIndexFor(levels) {
			for (var i = 0; i < levels.length; i += 1) if (isOffLevel(levels[i])) return i;
			return 0;
		}
		/**
		 * Continuous knob position (0..1) for a stop index.
		 * @param index - stop index.
		 * @param count - number of stops.
		 */
		function positionOfIndex(index, count) {
			if (count <= 1) return 0;
			return clamp(index, 0, count - 1) / (count - 1);
		}
		/**
		 * Nearest stop for a continuous position.
		 * @param position - 0..1 along the rail.
		 * @param count - number of stops.
		 */
		function snapIndex(position, count) {
			if (count <= 1) return 0;
			return clamp(Math.round(clamp01(position) * (count - 1)), 0, count - 1);
		}
		/**
		 * Map a pointer x coordinate onto the rail with the same inset geometry the
		 * knob uses, so both extremes stay reachable.
		 * @param clientX - pointer x in viewport coordinates.
		 * @param rect - the slider's bounding rect.
		 */
		function pointerPosition(clientX, rect) {
			var span = rect.width - KNOB;
			if (!(span > 0)) return 0;
			return clamp01((clientX - rect.left - KNOB / 2) / span);
		}
		/**
		 * Deterministic bead field for the filled part of the track: irregular
		 * sizes, heights and phases, all drifting rightwards. No `Math.random`, so
		 * a re-render cannot reshuffle the stream.
		 * @param count - number of beads.
		 * @returns heights/sizes/opacities plus a phase fraction and a duration stretch.
		 */
		function dotsFor(count) {
			var out = [];
			for (var i = 0; i < count; i += 1) {
				var phase = ((i + 0.5) * 0.6180339887) % 1;
				out.push({
					top: 16 + ((i * 37) % 62),
					size: 2 + (i % 4),
					opacity: 0.4 + ((i * 3) % 5) * 0.12,
					phase: Number((-phase).toFixed(3)),
					stretch: Number((1 + (((i * 7) % 5) - 2) * 0.03).toFixed(2))
				});
			}
			return out;
		}
		/**
		 * How far the continuous position has travelled from the stop below the top
		 * stop (blue) to the top stop (violet).
		 * @param count - number of stops.
		 * @param position - continuous 0..1 position along the rail.
		 * @returns 0..1 blend weight; everything below the second-to-top stop is 0.
		 */
		function blendFor(count, position) {
			if (count <= 1) return 0;
			var from = count <= 2 ? 0 : (count - 2) / (count - 1);
			if (!(position > from)) return 0;
			return clamp01((position - from) / (1 - from));
		}
		/**
		 * Bead speed multiplier: 1x below the top stop, 1.5x at the top stop or with
		 * the bolt pressed, 2x with both.
		 * @param topLevel - whether the knob sits on the top stop.
		 * @param boltOn - whether the decorative bolt is lit.
		 */
		function flowSpeedFor(topLevel, boltOn) {
			return 1 + (topLevel ? 0.5 : 0) + (boltOn ? 0.5 : 0);
		}
		/**
		 * Apply a speed multiplier to already-running bead animations. Playback rate
		 * is used instead of changing the duration, so the stream accelerates from
		 * wherever each bead is instead of jumping to a new phase.
		 * @param node - the slider (or any ancestor of the beads).
		 * @param speed - multiplier, 1 for the base speed.
		 */
		function applyFlow(node, speed) {
			if (node === null || node === undefined || typeof node.querySelectorAll !== "function") return;
			var beads = node.querySelectorAll(".cep-bead");
			for (var i = 0; i < beads.length; i += 1) {
				var animations = typeof beads[i].getAnimations === "function" ? beads[i].getAnimations() : [];
				for (var j = 0; j < animations.length; j += 1) {
					try {
						if (typeof animations[j].updatePlaybackRate === "function") animations[j].updatePlaybackRate(speed);
						else animations[j].playbackRate = speed;
					} catch (failure) {
						/* decorative: a browser without WAAPI simply keeps the base speed */
					}
				}
			}
		}
		/** Provider display rank: DeepSeek Account, DeepSeek, then catalog order. */
		function providerRank(group) {
			if (group.id === "deepseek-account") return 0;
			if (group.id === "deepseek-official") return 1;
			return 2;
		}
		/**
		 * Copy one group list with provider ordering applied, keeping catalog order
		 * inside each provider.
		 * @param groups - catalog groups.
		 */
		function orderedGroups(groups) {
			var copy = [];
			for (var i = 0; i < groups.length; i += 1) {
				var group = groups[i];
				if (group === undefined || group === null) continue;
				copy.push({ group: group, rank: providerRank(group), at: i });
			}
			copy.sort(function (a, b) { return a.rank - b.rank || a.at - b.at; });
			var ordered = [];
			for (var j = 0; j < copy.length; j += 1) ordered.push(copy[j].group);
			return ordered;
		}
		/** Ordered, case-insensitive subsequence test used by model search. */
		function isSubsequence(haystack, needle) {
			var cursor = 0;
			for (var i = 0; i < needle.length; i += 1) {
				cursor = haystack.indexOf(needle[i], cursor);
				if (cursor === -1) return false;
				cursor += 1;
			}
			return true;
		}
		/**
		 * Rank models for a search query: prefix matches, then inner substring,
		 * then ordered-subsequence matches, each in catalog order.
		 * @param models - the group's models.
		 * @param query - raw query text.
		 */
		function filterModels(models, query) {
			var needle = String(query === undefined || query === null ? "" : query).trim().toLowerCase();
			if (needle.length === 0) return models.slice();
			var scored = [];
			for (var i = 0; i < models.length; i += 1) {
				var model = models[i];
				if (model === undefined || model === null) continue;
				var name = String(model.name === undefined || model.name === null ? model.id || "" : model.name).toLowerCase();
				var at = name.indexOf(needle);
				if (at !== -1) scored.push({ model: model, rank: at === 0 ? 0 : 1, at: at, index: i });
				else if (isSubsequence(name, needle)) scored.push({ model: model, rank: 2, at: name.length, index: i });
			}
			scored.sort(function (a, b) { return a.rank - b.rank || a.at - b.at || a.index - b.index; });
			var out = [];
			for (var j = 0; j < scored.length; j += 1) out.push(scored[j].model);
			return out;
		}
		/** Interpolate `{name}` placeholders without a library. */
		function interpolate(template, params) {
			if (params === undefined || params === null) return template;
			return String(template).replace(/\{(\w+)\}/g, function (match, name) {
				var value = params[name];
				return value === undefined || value === null ? match : String(value);
			});
		}
		/** The snapshot a seat renders while its session directory is not resolvable yet. */
		var EMPTY_SNAPSHOT = {
			current: null,
			routable: null,
			groups: [],
			failures: [],
			status: "loading",
			pending: null,
			error: null,
			retainedEffort: undefined
		};
		/** A store that never changes: the seat's fallback when the injected one is unusable. */
		var EMPTY_STORE = {
			getSnapshot: function () { return EMPTY_SNAPSHOT; },
			subscribe: function () { return function () {}; }
		};
		/**
		 * Whether a value can act as a snapshot store.
		 * @param value - the injected `directory` share.
		 */
		function isStore(value) {
			return value !== null && value !== undefined && typeof value.getSnapshot === "function" && typeof value.subscribe === "function";
		}
		/**
		 * The seat's read face for one session.
		 *
		 * `modelDirectories.directoryFor()` fails loud while a session scope is
		 * still being mounted — exactly what happens when the user switches
		 * session or workspace. A throwing inject face makes the renderer treat
		 * the whole entry as crashed and abdicate it (the shipped seat then takes
		 * over until the plugin is toggled), so this face never throws: it
		 * resolves lazily, re-resolves when the session binding is replaced, and
		 * keeps retrying briefly while the scope is still coming up.
		 * @param services - `{ models, sessions }` from the plugin scope.
		 * @param sessionId - the session the seat is rendering for.
		 */
		function makeSeatFace(services, sessionId) {
			var models = services.models;
			var sessions = services.sessions;
			var directory = null;
			var boundTo = null;
			var listeners = new Set();
			var timer = 0;
			var attempts = 0;
			var closed = false;

			/** Whether this session may use Agent-bound model RPCs. */
			function isAvailable() {
				try {
					return sessions.subagentAddress(sessionId) === undefined;
				} catch (error) {
					return false;
				}
			}

			/** The live binding identity, or null while the session has no scope. */
			function currentBinding() {
				try {
					return sessions.binding(sessionId) === undefined ? null : sessions.binding(sessionId);
				} catch (error) {
					return null;
				}
			}

			/**
			 * Resolve (or re-resolve) the session's shared directory.
			 * @returns the directory, or null while the scope is not ready.
			 */
			function resolve() {
				if (closed) return null;
				var binding = currentBinding();
				if (binding === null) {
					directory = null;
					boundTo = null;
					return null;
				}
				if (directory !== null && boundTo === binding) return directory;
				try {
					directory = models.directoryFor(sessionId);
					boundTo = binding;
				} catch (error) {
					directory = null;
					boundTo = null;
				}
				return directory;
			}

			function notify() {
				var pending = [];
				listeners.forEach(function (listener) { pending.push(listener); });
				for (var i = 0; i < pending.length; i += 1) {
					try {
						pending[i]();
					} catch (error) {
						/* a broken subscriber must not break the others */
					}
				}
			}

			/** Keep waking up until the session scope exists (bounded). */
			function wake() {
				if (closed || directory !== null || timer !== 0 || attempts >= 40) return;
				timer = setTimeout(function () {
					timer = 0;
					attempts += 1;
					if (resolve() !== null) notify();
					else wake();
				}, 120);
			}

			var store = {
				getSnapshot: function () {
					var resolved = resolve();
					if (resolved === null) return EMPTY_SNAPSHOT;
					try {
						var snapshot = resolved.store.getSnapshot();
						return snapshot === undefined || snapshot === null ? EMPTY_SNAPSHOT : snapshot;
					} catch (error) {
						return EMPTY_SNAPSHOT;
					}
				},
				subscribe: function (listener) {
					listeners.add(listener);
					var resolved = resolve();
					if (resolved === null) {
						wake();
						return function () { listeners.delete(listener); };
					}
					var inner = null;
					try {
						inner = resolved.store.subscribe(listener);
					} catch (error) {
						inner = null;
					}
					return function () {
						listeners.delete(listener);
						if (typeof inner === "function") {
							try {
								inner();
							} catch (error) {
								/* already detached */
							}
						}
					};
				}
			};

			return {
				sessionId: sessionId,
				available: isAvailable(),
				directory: store,
				load: function () {
					if (!isAvailable()) return;
					var resolved = resolve();
					if (resolved === null) {
						wake();
						return;
					}
					try {
						var operation = resolved.load();
						if (operation !== undefined && operation !== null && typeof operation.catch === "function") operation.catch(function () {});
					} catch (error) {
						/* the store surfaces load failures through its own status */
					}
				},
				select: function (selection) {
					if (!isAvailable()) return Promise.resolve(undefined);
					var resolved = resolve();
					if (resolved === null) {
						wake();
						return Promise.resolve(undefined);
					}
					try {
						return resolved.select(selection);
					} catch (error) {
						return Promise.reject(error);
					}
				},
				/** Stop the retry timer (called when the plugin scope dies). */
				close: function () {
					closed = true;
					if (timer !== 0) clearTimeout(timer);
					timer = 0;
					listeners.clear();
				}
			};
		}
		/**
		 * One user-facing sentence for a rejected selection.
		 * @param error - the wire error or a thrown value.
		 * @param t - translator.
		 */
		function describeError(error, t) {
			if (error === undefined || error === null) return t("error.unknown");
			if (typeof error === "string") return error;
			if (error.code === "session/writer-held") return t("error.sessionInUse");
			if (typeof error.message === "string" && error.message.length > 0) return error.message;
			return t("error.unknown");
		}
		/**
		 * Style helper shared by the knob, the fill and the stop dots: the
		 * `--cep-pct` fraction plus the inset (the knob diameter) all of them are
		 * measured against, so every mark lands on the same axis.
		 * @param fraction - 0..1 along the rail.
		 * @param inset - the knob diameter in px.
		 */
		function pctStyle(fraction, inset) {
			var style = {};
			style["--cep-pct"] = String(clamp01(fraction));
			style["--cep-inset"] = String(inset) + "px";
			return style;
		}
		/** Current effort value of a selection, with the model's default filled in. */
		function effortValueOf(selection, reasoning) {
			if (selection === undefined || selection === null) return undefined;
			if (selection.reasoningEffort !== undefined) return selection.reasoningEffort;
			return reasoning === undefined || reasoning === null ? undefined : reasoning.defaultEffort;
		}
		/**
		 * The card's inline style: placement plus the live token the colours read.
		 * @param position - resolved placement, or null while measuring.
		 * @param blend - violet blend weight as a CSS percentage.
		 */
		function panelStyle(position, blend) {
			var style;
			if (position === null) style = { visibility: "hidden", left: 0, top: 0 };
			else if (position.above === true) style = { left: position.left + "px", bottom: position.bottom + "px" };
			else style = { left: position.left + "px", top: position.top + "px" };
			style["--cep-blend"] = blend;
			return style;
		}
		/** Group heading text: known providers are localized, others keep their catalog name. */
		function groupLabelOf(group, t) {
			if (group.id === "deepseek-account") return t("group.account");
			if (group.id === "deepseek-official") return t("group.official");
			return typeof group.name === "string" && group.name.length > 0 ? group.name : String(group.id);
		}
		/** A cheap identity for the rendered group shape, used as a placement dependency. */
		function groupingKey(groups) {
			var parts = [];
			for (var i = 0; i < groups.length; i += 1) {
				var models = Array.isArray(groups[i].models) ? groups[i].models : [];
				var names = [];
				for (var j = 0; j < models.length; j += 1) names.push(String(models[j].id));
				parts.push(String(groups[i].id) + ":" + names.join(","));
			}
			return parts.join("|");
		}
		//#endregion

		//#region /model -> panel bridge
		/**
		 * Open requests keyed by session id: the seat subscribes on mount and the
		 * `/model` action asks whichever seat is resident for that session. A
		 * request with no listener is dropped, so the command never opens a panel
		 * that is not mounted.
		 */
		var openRequests = new Map();

		function subscribeOpen(sessionId, listener) {
			var set = openRequests.get(sessionId);
			if (set === undefined) {
				set = new Set();
				openRequests.set(sessionId, set);
			}
			set.add(listener);
			return function () {
				set.delete(listener);
				if (set.size === 0) openRequests.delete(sessionId);
			};
		}

		function requestOpen(sessionId) {
			var set = openRequests.get(sessionId);
			if (set === undefined) return false;
			var listeners = [];
			set.forEach(function (listener) { listeners.push(listener); });
			for (var i = 0; i < listeners.length; i += 1) {
				try {
					listeners[i]();
				} catch (error) {
					/* one broken seat must not stop the others */
				}
			}
			return listeners.length > 0;
		}
		//#endregion

		//#region seat
		/** Bead field, built once: the same stream on every render. */
		var BEADS = dotsFor(16);
		/**
		 * The composer model seat.
		 * @param props - `locked` from the composer, the injected face
		 * (sessionId/available/directory/load/select), and the locale `t` seat.
		 */
		function ClaudeEffortSeat(props) {
			var t = typeof props.t === "function" ? props.t : function (key, params) { return interpolate(zh[key] === undefined ? key : zh[key], params); };
			/* A session switch can hand us a face whose store is gone; never let that throw out of render. */
			var store = isStore(props.directory) ? props.directory : EMPTY_STORE;
			var sessionId = props.sessionId;
			var available = props.available !== false && store !== EMPTY_STORE;
			var disabled = available !== true || props.locked === true;

			var snap = React.useSyncExternalStore(
				function (listener) {
					try {
						var unsubscribe = store.subscribe(listener);
						return typeof unsubscribe === "function" ? unsubscribe : function () {};
					} catch (error) {
						return function () {};
					}
				},
				function () {
					try {
						return store.getSnapshot();
					} catch (error) {
						return EMPTY_SNAPSHOT;
					}
				}
			);

			var openPair = React.useState(false);
			var open = openPair[0];
			var setOpen = openPair[1];
			var modePair = React.useState("slider");
			var mode = modePair[0];
			var setMode = modePair[1];
			var queryPair = React.useState("");
			var query = queryPair[0];
			var setQuery = queryPair[1];
			var posPair = React.useState(null);
			var position = posPair[0];
			var setPosition = posPair[1];
			var dragPair = React.useState(null);
			var dragPosition = dragPair[0];
			var setDragPosition = dragPair[1];
			var pendingPair = React.useState(null);
			var pendingIndex = pendingPair[0];
			var setPendingIndex = pendingPair[1];
			var burnPair = React.useState(false);
			var burn = burnPair[0];
			var setBurn = burnPair[1];
			var boltPair = React.useState(false);
			var boltOn = boltPair[0];
			var setBoltOn = boltPair[1];
			var errorPair = React.useState(null);
			var error = errorPair[0];
			var setError = errorPair[1];

			var triggerRef = React.useRef(null);
			var panelRef = React.useRef(null);
			var searchRef = React.useRef(null);
			var sliderRef = React.useRef(null);
			var openRef = React.useRef(open);
			openRef.current = open;
			var resizeRef = React.useRef({ key: null, height: null, timer: 0, open: false });
			var generatedId = React.useId();
			var panelId = "cep" + String(generatedId).replace(/[^a-zA-Z0-9_-]/g, "") + "-panel";

			var state = snap === undefined || snap === null ? {} : snap;
			var groups = React.useMemo(function () {
				return orderedGroups(Array.isArray(state.groups) ? state.groups : []);
			}, [state.groups]);

			var choices = React.useMemo(function () {
				var out = [];
				for (var i = 0; i < groups.length; i += 1) {
					var models = Array.isArray(groups[i].models) ? groups[i].models : [];
					for (var j = 0; j < models.length; j += 1) out.push({ provider: groups[i].id, group: groups[i], model: models[j] });
				}
				return out;
			}, [groups]);

			var current = state.current === undefined || state.current === null ? null : state.current;
			var currentChoice = null;
			for (var ci = 0; ci < choices.length; ci += 1) {
				if (current !== null && choices[ci].provider === current.provider && choices[ci].model.id === current.model) {
					currentChoice = choices[ci];
					break;
				}
			}
			var reasoning = currentChoice !== null ? currentChoice.model.reasoning : undefined;
			var levels = React.useMemo(function () { return effortLevelsOf(reasoning); }, [reasoning]);
			var effectiveEffort = current === null ? undefined : current.reasoningEffort === undefined ? reasoning === undefined ? undefined : reasoning.defaultEffort : current.reasoningEffort;
			var storeIndex = levelIndexOf(levels, effectiveEffort);
			var pending = state.pending === undefined || state.pending === null ? null : state.pending;
			var busy = pending !== null;
			var loading = current === null && state.status === "loading";

			var levelName = function (level) {
				if (level === undefined || level === null) return "";
				return level.name === null ? t("effort.default") : String(level.name);
			};
			var effortLabel;
			if (reasoning === undefined) effortLabel = state.retainedEffort;
			else if (storeIndex >= 0) effortLabel = levelName(levels[storeIndex]);
			else effortLabel = effectiveEffort === undefined ? undefined : String(effectiveEffort);

			var modelLabel = loading ? t("trigger.loading") : currentChoice !== null ? currentChoice.model.name || currentChoice.model.id : current === null ? t("trigger.fallback") : String(current.provider) + "/" + String(current.model);
			var triggerAria = loading ? t("trigger.loading") : current === null ? t("trigger.selectAria") : effortLabel === undefined ? t("trigger.ariaModel", { model: modelLabel }) : t("trigger.ariaEffort", { model: modelLabel, effort: effortLabel });
			var triggerTitle = effortLabel === undefined ? modelLabel : modelLabel + " · " + effortLabel;

			var showSearch = choices.length > 4;
			var filteredGroups = React.useMemo(function () {
				if (!showSearch || query.trim().length === 0) return groups;
				var out = [];
				for (var i = 0; i < groups.length; i += 1) {
					var models = filterModels(Array.isArray(groups[i].models) ? groups[i].models : [], query);
					if (models.length === 0) continue;
					var copy = {};
					for (var key in groups[i]) if (Object.prototype.hasOwnProperty.call(groups[i], key)) copy[key] = groups[i][key];
					copy.models = models;
					out.push(copy);
				}
				return out;
			}, [groups, query, showSearch]);
			var failures = Array.isArray(state.failures) ? state.failures : [];
			var showFailures = failures.length > 0 && query.trim().length === 0;

			/* ---- placement ----
			 * Anchored by its BOTTOM when it opens above the trigger, so the
			 * grow/shrink animation moves the card's top edge instead of pushing
			 * it down over the composer. */
			var place = React.useCallback(function () {
				var trigger = triggerRef.current;
				var panel = panelRef.current;
				if (trigger === null || panel === null) return;
				var rect = trigger.getBoundingClientRect();
				var width = panel.offsetWidth;
				var height = panel.offsetHeight;
				var MARGIN = 12;
				var x = rect.right - width;
				if (width > 0) x = Math.min(Math.max(x, MARGIN), Math.max(MARGIN, window.innerWidth - width - MARGIN));
				if (height > 0 && rect.top - 10 - height >= MARGIN) {
					setPosition({ left: x, bottom: window.innerHeight - rect.top + 10, above: true });
					return;
				}
				var top = rect.bottom + 10;
				if (height > 0) top = Math.min(Math.max(top, MARGIN), Math.max(MARGIN, window.innerHeight - height - MARGIN));
				setPosition({ left: x, top: top, above: false });
			}, []);

			var layoutKey = groupingKey(filteredGroups);
			React.useLayoutEffect(function () {
				if (!open) {
					setPosition(null);
					return;
				}
				place();
				window.addEventListener("scroll", place, true);
				window.addEventListener("resize", place);
				return function () {
					window.removeEventListener("scroll", place, true);
					window.removeEventListener("resize", place);
				};
			}, [open, place, layoutKey, showFailures, levels.length, mode, showSearch, query.length > 0, burn]);

			/**
			 * Morph the card between content heights: every view change, the burn
			 * hint taking over the header, an error strip appearing — all of them
			 * animate from the height the card had to the height it now needs,
			 * instead of snapping. The card is anchored by its bottom edge, so it
			 * grows upwards out of the composer.
			 */
			var heightKey = mode + "|" + (burnVisible ? 1 : 0) + "|" + (error !== null ? 1 : 0) + "|" + (showSearch ? 1 : 0) + "|" + levels.length + "|" + choices.length + "|" + (query.length > 0 ? 1 : 0);
			React.useLayoutEffect(function () {
				var panel = panelRef.current;
				if (panel === null) return;
				try {
					if (!open) {
						resizeRef.current.open = false;
						resizeRef.current.height = null;
						return;
					}
					var justOpened = resizeRef.current.open !== true;
					resizeRef.current.open = true;
					if (!justOpened && resizeRef.current.key === heightKey) return;
					resizeRef.current.key = heightKey;
					panel.style.height = "auto";
					var natural = panel.offsetHeight;
					var from = justOpened || resizeRef.current.height === null ? Math.min(natural, OPEN_FROM_HEIGHT) : resizeRef.current.height;
					resizeRef.current.height = natural;
					if (Math.abs(natural - from) < 1) {
						panel.style.height = "";
						return;
					}
					panel.style.height = from + "px";
					/* force the pinned height to become the transition's starting point */
					void panel.offsetHeight;
					panel.style.height = natural + "px";
					panel.setAttribute("data-resizing", "");
					if (resizeRef.current.timer !== 0) clearTimeout(resizeRef.current.timer);
					resizeRef.current.timer = setTimeout(function () {
						var node = panelRef.current;
						if (node !== null) {
							node.style.height = "";
							node.removeAttribute("data-resizing");
						}
						resizeRef.current.timer = 0;
					}, 320);
				} catch (failure) {
					/* sizing is a nicety: never let it break the card */
				}
			}, [open, heightKey]);

			/* Speed lives on the running animations, so 1x/1.5x/2x never restarts the stream. */
			React.useEffect(function () {
				if (!open) return;
				applyFlow(sliderRef.current, flowSpeed);
			}, [open, mode, topLevel, boltOn, levels.length, flowSpeed]);

			React.useEffect(function () {
				return function () {
					if (resizeRef.current.timer !== 0) clearTimeout(resizeRef.current.timer);
				};
			}, []);

			/* ---- the burn hint: shown while the knob is held on the top stop ---- */
			React.useEffect(function () {
				if (!burn) return;
				var timer = setTimeout(function () { setBurn(false); }, BURN_HOLD_MS);
				return function () { clearTimeout(timer); };
			}, [burn]);

			var focusInitial = React.useCallback(function () {
				var panel = panelRef.current;
				if (panel === null) return;
				if (mode === "slider") {
					if (sliderRef.current !== null) sliderRef.current.focus();
					else panel.focus();
					return;
				}
				if (mode === "models" && showSearch && searchRef.current !== null) {
					searchRef.current.focus();
					return;
				}
				var checked = panel.querySelector("[data-cep-item][aria-checked=true]");
				if (checked !== null) {
					checked.focus();
					return;
				}
				var first = panel.querySelector("[data-cep-item]");
				if (first !== null) first.focus();
				else panel.focus();
			}, [mode, showSearch]);

			React.useEffect(function () {
				if (!open) return;
				var frame = requestAnimationFrame(focusInitial);
				return function () { cancelAnimationFrame(frame); };
			}, [open, focusInitial, levels.length, mode]);

			var show = React.useCallback(function () {
				if (disabled || openRef.current) return;
				setError(null);
				setQuery("");
				setMode("slider");
				setBurn(false);
				setOpen(true);
				if (typeof props.load === "function") {
					try {
						props.load();
					} catch (failure) {
						/* a load failure surfaces through the store's status */
					}
				}
			}, [disabled, props]);

			var close = React.useCallback(function (focusTrigger) {
				setOpen(false);
				setMode("slider");
				setDragPosition(null);
				setBurn(false);
				if (focusTrigger === true && triggerRef.current !== null) triggerRef.current.focus();
			}, []);

			React.useEffect(function () {
				return subscribeOpen(sessionId, function () {
					show();
				});
			}, [sessionId, show]);

			React.useEffect(function () {
				if (!open) return;
				var onPointerDown = function (event) {
					var target = event.target;
					if (triggerRef.current !== null && triggerRef.current.contains(target)) return;
					if (panelRef.current !== null && panelRef.current.contains(target)) return;
					close(false);
				};
				var onKeyDown = function (event) {
					if (event.key !== "Escape") return;
					event.preventDefault();
					event.stopPropagation();
					if (mode !== "slider") setMode("slider");
					else close(true);
				};
				document.addEventListener("mousedown", onPointerDown, true);
				document.addEventListener("keydown", onKeyDown, true);
				return function () {
					document.removeEventListener("mousedown", onPointerDown, true);
					document.removeEventListener("keydown", onKeyDown, true);
				};
			}, [open, close, mode]);

			/* ---- writes ---- */
			var commit = React.useCallback(function (selection, index) {
				if (disabled) return;
				setError(null);
				if (typeof props.select !== "function") return;
				/* Optimistic: the knob stays where the pointer left it until the Host agrees. */
				setPendingIndex(index);
				var result;
				try {
					result = props.select(selection);
				} catch (failure) {
					setPendingIndex(null);
					setError(t("error.selection", { message: describeError(failure, t) }));
					return;
				}
				Promise.resolve(result).then(function (answer) {
					if (answer !== undefined && answer !== null && answer.ok === false) {
						setPendingIndex(null);
						/* A rejected write re-opens the slab, because a model change closes it. */
						setOpen(true);
						setError(t("error.selection", { message: describeError(answer.error, t) }));
					}
				}).catch(function (failure) {
					setPendingIndex(null);
					setOpen(true);
					setError(t("error.selection", { message: describeError(failure, t) }));
				});
			}, [disabled, props, t]);

			var chooseModel = React.useCallback(function (group, model) {
				if (current !== null && current.provider === group.id && current.model === model.id) {
					setMode("slider");
					return;
				}
				var effort = model.reasoning === undefined || model.reasoning === null ? undefined : model.reasoning.defaultEffort;
				var selection = { provider: group.id, model: model.id };
				if (effort !== undefined) selection.reasoningEffort = effort;
				commit(selection, null);
				close(true);
			}, [commit, close, current]);

			var chooseEffort = React.useCallback(function (index) {
				if (current === null || levels.length === 0) return;
				if (index < 0 || index >= levels.length) return;
				var level = levels[index];
				if (effortValueOf(current, reasoning) === level.id) {
					setPendingIndex(null);
					return;
				}
				var selection = { provider: current.provider, model: current.model };
				if (level.id !== undefined) selection.reasoningEffort = level.id;
				commit(selection, index);
			}, [commit, current, levels, reasoning]);

			/* ---- pointer and keyboard on the slider ---- */
			/**
			 * Row-click factories. The render loops below use `var`, so a handler
			 * must capture its own row values instead of reading the loop bindings.
			 */
			var bindModelClick = function (groupRef, modelRef) {
				return function () { chooseModel(groupRef, modelRef); };
			};
			var bindLevelClick = function (index) {
				return function () {
					chooseEffort(index);
					setMode("slider");
				};
			};

			/* The knob follows the pointer, then the in-flight optimistic stop, then the store. */
			var settledIndex = pending !== null && pendingIndex !== null ? pendingIndex : storeIndex;
			var displayIndex = dragPosition !== null ? snapIndex(dragPosition, levels.length) : settledIndex;
			var displayPosition = dragPosition !== null ? dragPosition : positionOfIndex(Math.max(0, settledIndex), levels.length);
			var liveLabel = displayIndex >= 0 && levels[displayIndex] !== undefined ? levelName(levels[displayIndex]) : effortLabel;
			var topLevel = levels.length > 0 && displayIndex === levels.length - 1;
			/* The hint follows the finger onto the top stop and lingers briefly after release. */
			var burnVisible = burn || (dragPosition !== null && topLevel);
			/* Colours slide from blue to violet across the last segment; the beads speed up with level and bolt. */
			var blend = Math.round(blendFor(levels.length, displayPosition) * 100) + "%";
			var flowSpeed = flowSpeedFor(topLevel, boltOn);

			var onSliderPointerDown = function (event) {
				if (disabled || levels.length === 0 || (event.button !== undefined && event.button > 0)) return;
				var node = sliderRef.current;
				if (node === null) return;
				event.preventDefault();
				event.stopPropagation();
				node.focus();
				setBurn(false);
				setDragPosition(pointerPosition(event.clientX, node.getBoundingClientRect()));
				try {
					node.setPointerCapture(event.pointerId);
				} catch (failure) {
					/* pointer capture is an optimization, not a requirement */
				}
			};
			var onSliderPointerMove = function (event) {
				if (dragPosition === null) return;
				var node = sliderRef.current;
				if (node === null) return;
				setDragPosition(pointerPosition(event.clientX, node.getBoundingClientRect()));
			};
			var onSliderPointerUp = function (event) {
				if (dragPosition === null) return;
				var node = sliderRef.current;
				var released = dragPosition;
				setDragPosition(null);
				if (node !== null) {
					try {
						node.releasePointerCapture(event.pointerId);
					} catch (failure) {
						/* the capture may already be gone */
					}
				}
				var target = snapIndex(released, levels.length);
				setBurn(target === levels.length - 1);
				chooseEffort(target);
			};
			var onSliderPointerCancel = function () {
				setDragPosition(null);
				setBurn(false);
			};
			var onSliderKeyDown = function (event) {
				if (levels.length === 0) return;
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					setMode("levels");
					return;
				}
				var next = null;
				if (event.key === "ArrowLeft" || event.key === "ArrowDown") next = storeIndex < 0 ? 0 : storeIndex - 1;
				else if (event.key === "ArrowRight" || event.key === "ArrowUp") next = storeIndex < 0 ? 0 : storeIndex + 1;
				else if (event.key === "Home") next = 0;
				else if (event.key === "End") next = levels.length - 1;
				if (next === null) return;
				event.preventDefault();
				event.stopPropagation();
				var target = clamp(next, 0, levels.length - 1);
				setBurn(target === levels.length - 1);
				chooseEffort(target);
			};

			var onListKeyDown = function (event) {
				if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
				var panel = panelRef.current;
				if (panel === null) return;
				var rows = [];
				var found = panel.querySelectorAll("[data-cep-item]");
				for (var i = 0; i < found.length; i += 1) rows.push(found[i]);
				if (rows.length === 0) return;
				event.preventDefault();
				var at = rows.indexOf(document.activeElement);
				var step = event.key === "ArrowDown" ? 1 : -1;
				var nextAt = at === -1 ? (step > 0 ? 0 : rows.length - 1) : (at + step + rows.length) % rows.length;
				rows[nextAt].focus();
			};

			var resetEffort = function () {
				if (levels.length === 0) return;
				setBurn(false);
				chooseEffort(resetIndexFor(levels));
			};

			/* ---- trigger ---- */
			var trigger = h("button", {
				ref: triggerRef,
				type: "button",
				className: "cep-trigger",
				"data-top": topLevel ? "" : undefined,
				"aria-label": triggerAria,
				"aria-haspopup": "dialog",
				"aria-expanded": open,
				"aria-controls": open ? panelId : undefined,
				"aria-busy": busy,
				title: triggerTitle,
				disabled: disabled,
				onClick: function () {
					if (open) close(true);
					else show();
				}
			},
				h("span", { className: "cep-triggerIcon", "aria-hidden": "true" }, h(ModelGlyph)),
				boltOn ? h("span", { className: "cep-triggerBolt", "aria-hidden": "true" }, h(LightningGlyph, { size: 12 })) : null,
				h("span", { className: "cep-triggerLabel" }, modelLabel),
				effortLabel === undefined ? null : h("span", { className: "cep-triggerDot", "aria-hidden": "true" }, "·"),
				effortLabel === undefined ? null : h("span", { className: "cep-triggerEffort" }, effortLabel),
				busy ? h("span", { className: "cep-spinner" }) : h(ChevronGlyph, { className: "cep-chevron" + (open ? " cep-chevronOpen" : "") })
			);

			/* ---- panel ---- */
			var body = null;
			if (open) {
				var contents = [];

				if (mode === "slider") {
					var bolt = h("span", { className: "cep-boltWrap" },
						h("button", {
							type: "button",
							className: "cep-boltBtn",
							"data-on": boltOn ? "" : undefined,
							"aria-pressed": boltOn,
							title: t("fast.speed") + " · " + t("fast.more"),
							"aria-label": t("fast.speed") + " · " + t("fast.more"),
							/* Decorative toggle: it lights up and badges the pill, but never touches the effort. */
							onClick: function () { setBoltOn(!boltOn); }
						}, h(LightningGlyph, { size: 19 })),
						h("span", { className: "cep-tip", "aria-hidden": "true" },
							h("span", { className: "cep-tipTitle" }, t("fast.speed")),
							h("span", { className: "cep-tipMore" }, t("fast.more"))
						)
					);

					var titles;
					if (burnVisible) {
						titles = h("div", { key: "titles-burn", className: "cep-titles cep-swap" },
							h("div", { className: "cep-burn" }, t("panel.burn"))
						);
					} else {
						titles = h("div", { key: "titles-level", className: "cep-titles cep-swap" },
							h("button", {
								type: "button",
								className: "cep-level",
								title: t("effort.open", { level: liveLabel === undefined ? "" : String(liveLabel) }),
								disabled: levels.length === 0,
								onClick: function () { setMode("levels"); },
								onMouseDown: preventDefault
							},
								h("span", { className: "cep-levelText" }, liveLabel === undefined ? t("effort.unsupported") : String(liveLabel)),
								levels.length > 0 ? h("span", { className: "cep-levelChev", "aria-hidden": "true" }, "›") : null
							),
							h("button", {
								type: "button",
								className: "cep-modelBtn",
								title: t("model.open", { model: modelLabel }),
								onClick: function () { setMode("models"); },
								onMouseDown: preventDefault
							}, modelLabel)
						);
					}

					contents.push(h("div", { key: "head", className: "cep-head" },
						bolt,
						titles,
						busy ? h("span", { className: "cep-reset", "aria-hidden": "true", "data-busy": "" }, h("span", { className: "cep-spinner" })) : h("button", {
							type: "button",
							className: "cep-reset",
							title: t("panel.reset"),
							"aria-label": t("panel.reset"),
							disabled: disabled || levels.length === 0,
							onClick: resetEffort,
							onMouseDown: preventDefault
						}, h(ResetGlyph))
					));

					if (levels.length === 0) {
						contents.push(h("div", { key: "noLevels", className: "cep-note" }, t("effort.unsupported")));
					} else {
						/* One solid dot per level: the fill paints over them, so a filled track reads as a clean gradient and an empty one shows the divisions. */
						var ticks = [];
						for (var ti = 0; ti < levels.length; ti += 1) {
							ticks.push(h("span", {
								key: "tick-" + ti,
								className: "cep-tick",
								style: pctStyle(positionOfIndex(ti, levels.length), KNOB)
							}));
						}

						var beads = [];
						for (var si = 0; si < BEADS.length; si += 1) {
							var bead = BEADS[si];
							beads.push(h("span", {
								key: "bead-" + si,
								className: "cep-bead",
								style: {
									top: bead.top + "%",
									width: bead.size + "px",
									height: bead.size + "px",
									opacity: String(bead.opacity),
									animationDelay: (BEAD_BASE_SECONDS * bead.phase).toFixed(2) + "s",
									animationDuration: (BEAD_BASE_SECONDS * bead.stretch).toFixed(2) + "s"
								}
							}));
						}

						contents.push(h("div", {
							key: "slider",
							ref: sliderRef,
							className: "cep-slider",
							role: "slider",
							tabIndex: 0,
							title: t("panel.effort") + " · ← →",
							"data-drag": dragPosition !== null ? "" : undefined,
							"aria-label": t("panel.effort"),
							"aria-valuemin": 0,
							"aria-valuemax": Math.max(0, levels.length - 1),
							"aria-valuenow": displayIndex < 0 ? 0 : displayIndex,
							"aria-valuetext": liveLabel === undefined ? "" : String(liveLabel),
							"aria-disabled": disabled,
							onPointerDown: onSliderPointerDown,
							onPointerMove: onSliderPointerMove,
							onPointerUp: onSliderPointerUp,
							onPointerCancel: onSliderPointerCancel,
							onKeyDown: onSliderKeyDown,
							onLostPointerCapture: function () { setDragPosition(null); }
						},
							h("div", { className: "cep-track" },
								ticks,
								h("div", { className: "cep-fill", style: pctStyle(displayPosition, KNOB) },
									h("span", { className: "cep-fillGlow", "aria-hidden": "true" }),
									beads
								)
							),
							h("div", { className: "cep-knob", style: pctStyle(displayPosition, KNOB) })
						));
					}
				}

				if (mode === "levels") {
					var levelRows = [];
					for (var li = 0; li < levels.length; li += 1) {
						levelRows.push(h("button", {
							key: "level-" + li,
							type: "button",
							role: "menuitemradio",
							"aria-checked": displayIndex === li,
							"data-cep-item": "",
							className: "cep-item",
							onClick: bindLevelClick(li),
							onMouseDown: preventDefault
						},
							h("span", { className: "cep-dot", "aria-hidden": "true" }, displayIndex === li ? h(CheckGlyph) : null),
							h("span", { className: "cep-itemName" }, levelName(levels[li])),
							levels[li].id !== undefined && reasoning !== undefined && reasoning.defaultEffort === levels[li].id ? h("span", { className: "cep-itemTag" }, t("panel.defaultTag")) : null
						));
					}
					contents.push(h("div", { key: "levelsHead", className: "cep-listHead" },
						h("button", {
							type: "button",
							className: "cep-back",
							title: t("panel.back"),
							"aria-label": t("panel.back"),
							onClick: function () { setMode("slider"); },
							onMouseDown: preventDefault
						}, h(BackGlyph)),
						h("span", { className: "cep-listTitle" }, t("panel.effort")),
						h("span", { className: "cep-reset", "aria-hidden": "true" }, busy ? h("span", { className: "cep-spinner" }) : null)
					));
					contents.push(h("div", { key: "levels", className: "cep-items", role: "menu", onKeyDown: onListKeyDown },
						levels.length === 0 ? h("div", { className: "cep-note" }, t("effort.unsupported")) : levelRows
					));
				}

				if (mode === "models") {
					var listRows = [];
					for (var gi = 0; gi < filteredGroups.length; gi += 1) {
						var group = filteredGroups[gi];
						var rows = [];
						var models = Array.isArray(group.models) ? group.models : [];
						for (var mi = 0; mi < models.length; mi += 1) {
							var model = models[mi];
							var selected = current !== null && current.provider === group.id && current.model === model.id;
							rows.push(h("button", {
								key: String(model.id),
								type: "button",
								role: "menuitemradio",
								"aria-checked": selected,
								"data-cep-item": "",
								className: "cep-item",
								onClick: bindModelClick(group, model),
								onMouseDown: preventDefault
							},
								h("span", { className: "cep-dot", "aria-hidden": "true" }, selected ? h(CheckGlyph) : null),
								h("span", { className: "cep-itemName" }, model.name === undefined || model.name === null ? String(model.id) : model.name)
							));
						}
						if (rows.length === 0) continue;
						listRows.push(h("div", { key: String(group.id), className: "cep-group", role: "group", "aria-label": groupLabelOf(group, t) },
							h("div", { className: "cep-groupTitle" }, groupLabelOf(group, t)),
							rows
						));
					}

					var listChildren = [];
					if (listRows.length === 0) {
						var emptyText = state.status === "loading" ? t("panel.loading") : query.trim().length > 0 ? t("search.empty") : t("panel.empty");
						listChildren.push(h("div", { key: "empty", className: "cep-note" }, emptyText));
					}
					listChildren.push.apply(listChildren, listRows);
					if (showFailures) {
						for (var fi = 0; fi < failures.length; fi += 1) {
							var failure = failures[fi];
							listChildren.push(h("div", { key: "failure-" + String(failure.id), className: "cep-noteError" }, String(failure.name || failure.id) + " · " + String(failure.message || t("error.unknown"))));
						}
					}

					contents.push(h("div", { key: "modelsHead", className: "cep-listHead" },
						h("button", {
							type: "button",
							className: "cep-back",
							title: t("panel.back"),
							"aria-label": t("panel.back"),
							onClick: function () { setMode("slider"); },
							onMouseDown: preventDefault
						}, h(BackGlyph)),
						h("span", { className: "cep-listTitle" }, t("panel.models")),
						h("span", { className: "cep-reset", "aria-hidden": "true" }, busy ? h("span", { className: "cep-spinner" }) : null)
					));

					if (showSearch) {
						contents.push(h("div", { key: "search", className: "cep-searchRow" },
							h("input", {
								ref: searchRef,
								className: "cep-search",
								type: "text",
								value: query,
								placeholder: t("search.placeholder"),
								"aria-label": t("search.aria"),
								spellCheck: false,
								autoComplete: "off",
								onChange: function (event) { setQuery(event.target.value); },
								onKeyDown: function (event) {
									if (event.key !== "Enter") return;
									event.preventDefault();
									var panel = panelRef.current;
									var first = panel === null ? null : panel.querySelector("[data-cep-item]");
									if (first !== null) first.click();
								}
							}),
							query.length > 0 ? h("button", {
								type: "button",
								className: "cep-searchClear",
								"aria-label": t("search.clear"),
								title: t("search.clear"),
								onMouseDown: preventDefault,
								onClick: function () {
									setQuery("");
									if (searchRef.current !== null) searchRef.current.focus();
								}
							}, h(CloseGlyph)) : null
						));
					}

					contents.push(h("div", { key: "list", className: "cep-items", role: "menu", onKeyDown: onListKeyDown }, listChildren));
				}

				if (error !== null) contents.push(h("div", { key: "error", className: "cep-error", role: "alert" }, String(error)));
				if (state.error !== undefined && state.error !== null && choices.length === 0) {
					contents.push(h("div", { key: "loadError", className: "cep-noteError" },
						t("panel.error", { message: String(state.error) }),
						h("button", {
							type: "button",
							className: "cep-retry",
							onMouseDown: preventDefault,
							onClick: function () {
								if (typeof props.load === "function") {
									try {
										props.load();
									} catch (failure) {
										/* surfaced by the store */
									}
								}
							}
						}, t("panel.retry"))
					));
				}

				var panel = h("div", {
					ref: panelRef,
					id: panelId,
					className: "cep-panel",
					role: "dialog",
					"data-top": topLevel ? "" : undefined,
					"aria-label": t("panel.effort"),
					tabIndex: -1,
					style: panelStyle(position, blend)
				}, h("div", { key: mode, className: "cep-view" }, contents));

				body = reactDom.createPortal(panel, document.body);
			}

			return h("div", { className: "cep-root" }, trigger, body);
		}

		/** Stop a press from moving focus away from the control that owns the panel. */
		function preventDefault(event) {
			event.preventDefault();
		}
		//#endregion

		//#region plugin body
		/** Services the seat composition needs before it can register. */
		var inject = ["locale", "sessions", "slots", "modelDirectories"];

		/**
		 * Client plugin body: mount the locale dictionaries, shadow the composer
		 * model seat, and point `/model` at the same slab.
		 * @param ctx - client root context.
		 */
		function apply(ctx) {
			ctx.effect(function () {
				return ctx.locale.register(NS, { zh: zh, en: en });
			}, "claude-effort-picker: dictionaries");

			ctx.inject(["slots", "modelDirectories", "sessions"], function (scope) {
				var models = scope.modelDirectories;
				var sessions = scope.sessions;
				var faces = new Set();
				scope.effect(function () {
					return function () {
						faces.forEach(function (face) {
							try {
								face.close();
							} catch (error) {
								/* best effort */
							}
						});
						faces.clear();
					};
				}, "claude-effort-picker: seat faces");
				scope.slots.inject("conversation.input.model", function () {
					return scope.slots.register({
						name: "conversation.input.model",
						priority: -10,
						locale: NS,
						inject: function (sessionId) {
							var face = makeSeatFace({ models: models, sessions: sessions }, sessionId);
							faces.add(face);
							return face;
						}
					}, ClaudeEffortSeat);
				});
			});

			ctx.inject(["commandUi"], function (scope) {
				var commandUi = scope.commandUi;
				scope.effect(function () {
					var live = commandUi === undefined || commandUi === null ? undefined : commandUi.live;
					var contributions = live === undefined || live === null ? undefined : live.contributions;
					if (!(contributions instanceof Map)) return undefined;
					var contribution = contributions.get("model");
					if (contribution === undefined || contribution === null) return undefined;
					var ui = contribution.ui;
					if (ui === undefined || ui === null || ui.kind !== "popupSelect") return undefined;
					contribution.ui = {
						kind: "action",
						run: function (session) {
							var id = session === undefined || session === null ? undefined : session.sessionId;
							if (id !== undefined) requestOpen(id);
						}
					};
					return function () {
						if (contribution.ui !== ui) contribution.ui = ui;
					};
				}, "claude-effort-picker: /model opens the picker");
			});
		}
		//#endregion

		exports.apply = apply;
		exports.inject = inject;
		exports.__testables = {
			NS: NS,
			zh: zh,
			en: en,
			CSS: CSS,
			KNOB: KNOB,
			TRACK: TRACK,
			ClaudeEffortSeat: ClaudeEffortSeat,
			positionOfIndex: positionOfIndex,
			snapIndex: snapIndex,
			pointerPosition: pointerPosition,
			effortLevelsOf: effortLevelsOf,
			levelIndexOf: levelIndexOf,
			resetIndexFor: resetIndexFor,
			isOffLevel: isOffLevel,
			orderedGroups: orderedGroups,
			filterModels: filterModels,
			dotsFor: dotsFor,
			blendFor: blendFor,
			flowSpeedFor: flowSpeedFor,
			applyFlow: applyFlow,
			makeSeatFace: makeSeatFace,
			isStore: isStore,
			EMPTY_SNAPSHOT: EMPTY_SNAPSHOT,
			interpolate: interpolate,
			describeError: describeError,
			groupingKey: groupingKey,
			pctStyle: pctStyle,
			requestOpen: requestOpen,
			subscribeOpen: subscribeOpen
		};
		return module.exports;
	}
});
