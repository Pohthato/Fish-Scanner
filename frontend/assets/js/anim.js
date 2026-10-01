// Page-level motion: intro, background slideshow, magnetic nav, counters.
import { $, $$, gsap, reduced } from "./ui.js";

export function splitTitle(el) {
	const text = el.textContent;
	el.textContent = "";
	for (const ch of text) {
		const span = document.createElement("span");
		span.className = ch === " " ? "sp" : "ch";
		span.setAttribute("aria-hidden", "true");
		span.textContent = ch === " " ? " " : ch;
		el.append(span);
	}
}

export function intro() {
	const title = $(".title");
	splitTitle(title);
	if (!gsap || reduced) return;

	const paths = $$(".logo-mark .draw");
	for (const p of paths) {
		const len = p.getTotalLength ? p.getTotalLength() : 100;
		gsap.set(p, { strokeDasharray: len, strokeDashoffset: len });
	}
	const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
	tl.from("#header .logo", { scale: 0.6, opacity: 0, duration: 0.6 })
		.to(paths, { strokeDashoffset: 0, duration: 1.1, stagger: 0.18, ease: "power2.inOut" }, "-=0.2")
		.from("#header .content", { y: 24, opacity: 0, duration: 0.7 }, "-=0.9")
		.from(".title .ch", { yPercent: 110, opacity: 0, rotate: 6, duration: 0.6, stagger: 0.025 }, "-=0.5")
		.from(".tagline", { opacity: 0, letterSpacing: "0.6em", duration: 0.8 }, "-=0.4")
		.from(".chips .chip", { y: 12, opacity: 0, duration: 0.45, stagger: 0.08 }, "-=0.5")
		.from(".stats li", { y: 12, opacity: 0, duration: 0.45, stagger: 0.1 }, "-=0.3")
		.from("#header nav li", { y: 14, opacity: 0, duration: 0.45, stagger: 0.07 }, "-=0.3");
}

export function countUp(el, value) {
	if (!gsap || reduced) {
		el.textContent = value;
		return;
	}
	const obj = { n: 0 };
	gsap.to(obj, {
		n: value, duration: 1.6, ease: "power2.out",
		onUpdate: () => { el.textContent = Math.round(obj.n); },
	});
}

// Crossfading slideshow with a slow Ken Burns drift. Slides after the first
// load lazily; with reduced motion it stays on the first still.
export function slideshow() {
	const slides = $$("#bg .slide");
	if (!slides.length) return;
	const load = (s) => {
		if (!s.dataset.loaded) {
			s.style.backgroundImage = `url("${s.dataset.src}")`;
			s.dataset.loaded = "1";
		}
	};
	load(slides[0]);
	slides[0].style.opacity = 1;
	if (!gsap || reduced || slides.length < 2) return;

	const HOLD = 12;
	let i = 0;
	const drift = (s) => {
		const dir = Math.random() > 0.5 ? 1 : -1;
		gsap.fromTo(s, { scale: 1.02, xPercent: -1.5 * dir, yPercent: 0 },
			{ scale: 1.12, xPercent: 1.5 * dir, yPercent: -1, duration: HOLD + 3, ease: "none" });
	};
	drift(slides[0]);
	load(slides[1]);
	setInterval(() => {
		const cur = slides[i];
		i = (i + 1) % slides.length;
		const next = slides[i];
		load(next);
		load(slides[(i + 1) % slides.length]);
		drift(next);
		gsap.to(next, { opacity: 1, duration: 2.4, ease: "sine.inOut" });
		gsap.to(cur, { opacity: 0, duration: 2.4, ease: "sine.inOut" });
	}, HOLD * 1000);
}

// Buttons lean toward the cursor a little.
export function magnetic() {
	if (!gsap || reduced || window.matchMedia("(pointer: coarse)").matches) return;
	for (const el of $$(".magnetic")) {
		el.addEventListener("pointermove", (e) => {
			const r = el.getBoundingClientRect();
			const x = (e.clientX - r.left - r.width / 2) * 0.25;
			const y = (e.clientY - r.top - r.height / 2) * 0.35;
			gsap.to(el, { x, y, duration: 0.3, ease: "power2.out" });
		});
		el.addEventListener("pointerleave", () => gsap.to(el, { x: 0, y: 0, duration: 0.5, ease: "elastic.out(1, 0.4)" }));
	}
}

// Gentle background parallax while an article panel scrolls.
export function parallax() {
	if (!gsap || reduced) return;
	window.addEventListener("scroll", () => {
		gsap.to("#bg", { y: -Math.min(window.scrollY * 0.06, 60), duration: 0.6, ease: "power2.out", overwrite: true });
	}, { passive: true });
}
