// Small shared helpers: DOM, API, toasts, motion preference.

export const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
export const gsap = window.gsap;

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function h(tag, attrs = {}, ...children) {
	const node = document.createElement(tag);
	for (const [k, v] of Object.entries(attrs)) {
		if (v === null || v === undefined || v === false) continue;
		if (k === "class") node.className = v;
		else if (k === "html") node.innerHTML = v;
		else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
		else node.setAttribute(k, v === true ? "" : v);
	}
	for (const c of children.flat()) {
		if (c === null || c === undefined || c === false) continue;
		node.append(c instanceof Node ? c : document.createTextNode(String(c)));
	}
	return node;
}

const SVG_NS = "http://www.w3.org/2000/svg";
export function svg(tag, attrs = {}) {
	const node = document.createElementNS(SVG_NS, tag);
	for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
	return node;
}

export async function api(path, options = {}) {
	const res = await fetch(path, options);
	if (res.status === 204) return null;
	const body = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(body.error || body.detail?.[0]?.msg || `Request failed (${res.status})`);
	return body;
}

export function toast(message, kind = "error", ms = 5200) {
	const node = h("div", { class: `toast ${kind}`, role: "status" }, message);
	$("#toasts").append(node);
	if (gsap && !reduced) gsap.from(node, { x: 40, opacity: 0, duration: 0.4, ease: "power3.out" });
	setTimeout(() => {
		if (gsap && !reduced) gsap.to(node, { x: 40, opacity: 0, duration: 0.3, onComplete: () => node.remove() });
		else node.remove();
	}, ms);
}

// Tween helper that degrades to an instant set when motion is reduced or GSAP is missing.
export function tween(target, vars) {
	if (!gsap) return null;
	if (reduced) {
		const { duration, ease, stagger, delay, ...end } = vars;
		return gsap.set(target, end);
	}
	return gsap.to(target, vars);
}

export function from(target, vars) {
	if (!gsap) return null;
	if (reduced) return gsap.from(target, { opacity: 0, duration: 0.2 });
	return gsap.from(target, vars);
}
