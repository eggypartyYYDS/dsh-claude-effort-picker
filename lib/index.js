/**
 * Copyright (C) 2026 eggypartyYYDS <yyds2458@outlook.com>
 * Licensed under the DSH-Claude-Effort-Picker Non-Commercial Attribution License 1.0
 * (see LICENSE): non-commercial use, attribution required; commercial use needs a
 * separate written license.
 *
 * dsh-claude-effort-picker — node half.
 *
 * The plugin is a pure browser-side surface: this module exists so the package
 * becomes a row in the Host's cordis tree, which is what makes the client
 * module system scan its `dsh.client` declaration and add the bundle to the
 * startup graph. It registers no Host service, listens to no event, and
 * contributes no Tool.
 */
export function apply() {}
