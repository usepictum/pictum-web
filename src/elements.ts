import {
	type AvatarFormat,
	type AvatarGender,
	type AvatarOptions,
	type AvatarVariant,
	avatar,
	icon,
	type PictumOptions,
	type PlaceholderDensity,
	type PlaceholderFormat,
	type PlaceholderOptions,
	placeholder,
	type QrCodeFormat,
	type QrCodeOptions,
	qrCode,
} from "pictum";
import { loadIcon } from "./icon-loader";

const IMAGE_ATTRIBUTES = [
	"alt",
	"loading",
	"decoding",
	"fetchpriority",
	"crossorigin",
	"referrerpolicy",
	"width",
	"height",
] as const;
const IMAGE_STYLE = `
	:host { display: inline-block; line-height: 0; }
	img { display: block; max-width: 100%; }
`;
const ICON_STYLE = `
	:host { display: inline-block; width: 1em; height: 1em; line-height: 0; }
	svg { display: block; width: 100%; height: 100%; }
`;

export type PictumStatus = "error" | "idle" | "loaded" | "loading";

export interface PictumElement extends HTMLElement {
	alt: string;
	baseUrl: string | null;
	readonly error: Error | null;
	readonly status: PictumStatus;
}

export interface PictumIconElement extends PictumElement {
	name: string;
}

export interface PictumAvatarElement extends PictumElement {
	seed: string;
	variant: AvatarVariant | null;
	gender: AvatarGender | null;
	format: AvatarFormat | null;
	size: number | null;
}

export interface PictumQrCodeElement extends PictumElement {
	value: string;
	format: QrCodeFormat | null;
	quietZone: boolean | null;
	foreground: string | null;
	background: string | null;
}

export interface PictumPlaceholderElement extends PictumElement {
	size: number | null;
	width: number | null;
	height: number | null;
	format: PlaceholderFormat | null;
	density: PlaceholderDensity | null;
	background: string | null;
	color: string | null;
	text: string | null;
}

type ElementConstructor<Element extends HTMLElement> = new () => Element;

export interface PictumElementConstructors {
	readonly "pictum-avatar": ElementConstructor<PictumAvatarElement>;
	readonly "pictum-icon": ElementConstructor<PictumIconElement>;
	readonly "pictum-placeholder": ElementConstructor<PictumPlaceholderElement>;
	readonly "pictum-qr-code": ElementConstructor<PictumQrCodeElement>;
}

let constructors: PictumElementConstructors | undefined;

export function definePictumElements(
	registry?: CustomElementRegistry,
): PictumElementConstructors {
	const target = registry ?? globalThis.customElements;
	if (target === undefined || globalThis.HTMLElement === undefined) {
		throw new Error("Pictum custom elements require a browser environment.");
	}

	constructors ??= createPictumElementConstructors();
	defineElement(target, "pictum-avatar", constructors["pictum-avatar"]);
	defineElement(target, "pictum-icon", constructors["pictum-icon"]);
	defineElement(
		target,
		"pictum-placeholder",
		constructors["pictum-placeholder"],
	);
	defineElement(target, "pictum-qr-code", constructors["pictum-qr-code"]);
	return constructors;
}

function defineElement<Element extends HTMLElement>(
	registry: CustomElementRegistry,
	name: string,
	elementConstructor: ElementConstructor<Element>,
): void {
	const existing = registry.get(name);
	if (existing === undefined) {
		registry.define(name, elementConstructor);
		return;
	}
	if (existing !== elementConstructor) {
		throw new Error(`The custom element ${name} is already defined.`);
	}
}

function createPictumElementConstructors(): PictumElementConstructors {
	abstract class PictumElementBase
		extends HTMLElement
		implements PictumElement
	{
		static elementProperties: readonly string[] = ["alt", "baseUrl"];

		#error: Error | null = null;
		#internals = this.attachInternals();
		#renderPending = false;
		#status: PictumStatus = "idle";

		get alt(): string {
			return this.getAttribute("alt") ?? "";
		}

		set alt(value: string) {
			this.setAttribute("alt", value);
		}

		get baseUrl(): string | null {
			return this.getAttribute("base-url");
		}

		set baseUrl(value: string | null) {
			this.reflectString("base-url", value);
		}

		get error(): Error | null {
			return this.#error;
		}

		get status(): PictumStatus {
			return this.#status;
		}

		connectedCallback(): void {
			const elementClass = this.constructor as typeof PictumElementBase;
			for (const property of elementClass.elementProperties) {
				this.upgradeProperty(property);
			}
			this.requestRender();
		}

		attributeChangedCallback(
			_name: string,
			oldValue: string | null,
			newValue: string | null,
		): void {
			if (oldValue !== newValue && this.isConnected) {
				this.requestRender();
			}
		}

		protected get pictumOptions(): PictumOptions {
			return this.baseUrl === null ? {} : { baseUrl: this.baseUrl };
		}

		protected abstract clearAsset(): void;

		protected abstract performRender(): void;

		protected reflectBoolean(name: string, value: boolean | null): void {
			if (value === null) {
				this.removeAttribute(name);
			} else {
				this.setAttribute(name, value ? "" : "false");
			}
		}

		protected reflectNumber(name: string, value: number | null): void {
			if (value === null) {
				this.removeAttribute(name);
			} else {
				this.setAttribute(name, String(value));
			}
		}

		protected reflectString(name: string, value: string | null): void {
			if (value === null) {
				this.removeAttribute(name);
			} else {
				this.setAttribute(name, value);
			}
		}

		protected reportError(reason: unknown): void {
			const error =
				reason instanceof Error ? reason : new Error("Unknown Pictum error.");
			this.setStatus("error", error);
			this.dispatchEvent(
				new ErrorEvent("error", { error, message: error.message }),
			);
		}

		protected setStatus(
			status: PictumStatus,
			error: Error | null = null,
		): void {
			this.#status = status;
			this.#error = error;
			this.#internals.states.delete("error");
			this.#internals.states.delete("loaded");
			this.#internals.states.delete("loading");
			if (status !== "idle") {
				this.#internals.states.add(status);
			}
		}

		protected updateAccessibility(): void {
			this.#internals.role = "img";
			this.#internals.ariaLabel = this.hasAttribute("alt") ? this.alt : null;
			this.#internals.ariaHidden = this.alt === "" ? "true" : null;
		}

		private requestRender(): void {
			if (this.#renderPending) {
				return;
			}
			this.#renderPending = true;
			queueMicrotask(() => {
				this.#renderPending = false;
				if (!this.isConnected) {
					return;
				}
				try {
					this.performRender();
				} catch (error) {
					this.clearAsset();
					this.reportError(error);
				}
			});
		}

		private upgradeProperty(property: string): void {
			if (!Object.hasOwn(this, property)) {
				return;
			}
			const element = this as unknown as Record<string, unknown>;
			const value = element[property];
			delete element[property];
			element[property] = value;
		}
	}

	abstract class PictumImageElementBase extends PictumElementBase {
		protected readonly image: HTMLImageElement;

		constructor() {
			super();
			const root = this.attachShadow({ mode: "open" });
			const style = document.createElement("style");
			style.textContent = IMAGE_STYLE;
			this.image = document.createElement("img");
			this.image.alt = "";
			this.image.setAttribute("aria-hidden", "true");
			this.image.setAttribute("part", "asset");
			this.image.addEventListener("load", () => {
				if (this.isConnected) {
					this.setStatus("loaded");
					this.dispatchEvent(new Event("load"));
				}
			});
			this.image.addEventListener("error", () => {
				if (this.isConnected) {
					this.reportError(new Error("The Pictum image failed to load."));
				}
			});
			root.append(style, this.image);
		}

		protected override clearAsset(): void {
			this.image.removeAttribute("src");
			this.setStatus("idle");
		}

		protected renderImage(
			url: string,
			dimensions?: { height: number; width: number },
		): void {
			this.updateAccessibility();
			for (const attribute of IMAGE_ATTRIBUTES) {
				if (attribute === "alt") {
					continue;
				}
				const value = this.getAttribute(attribute);
				if (value === null) {
					this.image.removeAttribute(attribute);
				} else {
					this.image.setAttribute(attribute, value);
				}
			}
			if (dimensions !== undefined) {
				this.image.width = dimensions.width;
				this.image.height = dimensions.height;
			}
			if (this.image.getAttribute("src") !== url) {
				this.setStatus("loading");
				this.image.src = url;
			}
		}
	}

	class PictumIconElementClass
		extends PictumElementBase
		implements PictumIconElement
	{
		static observedAttributes = ["alt", "base-url", "name"];
		static override elementProperties = ["alt", "baseUrl", "name"];

		#request = 0;
		#svg: SVGSVGElement;

		constructor() {
			super();
			const root = this.attachShadow({ mode: "open" });
			const style = document.createElement("style");
			style.textContent = ICON_STYLE;
			this.#svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
			this.#svg.setAttribute("aria-hidden", "true");
			this.#svg.setAttribute("part", "asset");
			root.append(style, this.#svg);
		}

		get name(): string {
			return this.getAttribute("name") ?? "";
		}

		set name(value: string) {
			this.setAttribute("name", value);
		}

		protected override clearAsset(): void {
			this.#request += 1;
			this.#svg.replaceChildren();
			this.#svg.removeAttribute("viewBox");
			this.setStatus("idle");
		}

		protected override performRender(): void {
			this.updateAccessibility();
			if (!this.hasAttribute("name")) {
				this.clearAsset();
				return;
			}

			const request = ++this.#request;
			this.#svg.replaceChildren();
			this.#svg.removeAttribute("viewBox");
			this.setStatus("loading");
			void loadIcon(icon(this.name, this.pictumOptions))
				.then((markup) => {
					if (request !== this.#request || !this.isConnected) {
						return;
					}
					const template = document.createElement("template");
					template.innerHTML = markup.body;
					this.#svg.setAttribute("viewBox", markup.viewBox);
					this.#svg.replaceChildren(template.content.cloneNode(true));
					this.setStatus("loaded");
					this.dispatchEvent(new Event("load"));
				})
				.catch((error: unknown) => {
					if (request !== this.#request || !this.isConnected) {
						return;
					}
					this.#svg.replaceChildren();
					this.#svg.removeAttribute("viewBox");
					this.reportError(error);
				});
		}
	}

	class PictumAvatarElementClass
		extends PictumImageElementBase
		implements PictumAvatarElement
	{
		static observedAttributes = [
			...IMAGE_ATTRIBUTES,
			"base-url",
			"format",
			"gender",
			"seed",
			"size",
			"variant",
		];
		static override elementProperties = [
			"alt",
			"baseUrl",
			"format",
			"gender",
			"seed",
			"size",
			"variant",
		];

		get seed(): string {
			return this.getAttribute("seed") ?? "";
		}

		set seed(value: string) {
			this.setAttribute("seed", value);
		}

		get variant(): AvatarVariant | null {
			return this.getAttribute("variant") as AvatarVariant | null;
		}

		set variant(value: AvatarVariant | null) {
			this.reflectString("variant", value);
		}

		get gender(): AvatarGender | null {
			return this.getAttribute("gender") as AvatarGender | null;
		}

		set gender(value: AvatarGender | null) {
			this.reflectString("gender", value);
		}

		get format(): AvatarFormat | null {
			return this.getAttribute("format") as AvatarFormat | null;
		}

		set format(value: AvatarFormat | null) {
			this.reflectString("format", value);
		}

		get size(): number | null {
			return readNumberAttribute(this, "size");
		}

		set size(value: number | null) {
			this.reflectNumber("size", value);
		}

		protected override performRender(): void {
			if (!this.hasAttribute("seed")) {
				this.clearAsset();
				return;
			}
			const options = {
				...this.pictumOptions,
				...(this.variant === null ? {} : { variant: this.variant }),
				...(this.gender === null ? {} : { gender: this.gender }),
				...(this.format === null ? {} : { format: this.format }),
				...(this.size === null ? {} : { size: this.size }),
			} as AvatarOptions;
			this.renderImage(avatar(this.seed, options).url);
		}
	}

	class PictumQrCodeElementClass
		extends PictumImageElementBase
		implements PictumQrCodeElement
	{
		static observedAttributes = [
			...IMAGE_ATTRIBUTES,
			"background",
			"base-url",
			"format",
			"foreground",
			"quiet-zone",
			"value",
		];
		static override elementProperties = [
			"alt",
			"background",
			"baseUrl",
			"format",
			"foreground",
			"quietZone",
			"value",
		];

		get value(): string {
			return this.getAttribute("value") ?? "";
		}

		set value(value: string) {
			this.setAttribute("value", value);
		}

		get format(): QrCodeFormat | null {
			return this.getAttribute("format") as QrCodeFormat | null;
		}

		set format(value: QrCodeFormat | null) {
			this.reflectString("format", value);
		}

		get quietZone(): boolean | null {
			return readBooleanAttribute(this, "quiet-zone");
		}

		set quietZone(value: boolean | null) {
			this.reflectBoolean("quiet-zone", value);
		}

		get foreground(): string | null {
			return this.getAttribute("foreground");
		}

		set foreground(value: string | null) {
			this.reflectString("foreground", value);
		}

		get background(): string | null {
			return this.getAttribute("background");
		}

		set background(value: string | null) {
			this.reflectString("background", value);
		}

		protected override performRender(): void {
			if (!this.hasAttribute("value")) {
				this.clearAsset();
				return;
			}
			const options: QrCodeOptions = {
				...this.pictumOptions,
				...(this.format === null ? {} : { format: this.format }),
				...(this.quietZone === null ? {} : { quietZone: this.quietZone }),
				...(this.foreground === null ? {} : { foreground: this.foreground }),
				...(this.background === null ? {} : { background: this.background }),
			};
			this.renderImage(qrCode(this.value, options).url);
		}
	}

	class PictumPlaceholderElementClass
		extends PictumImageElementBase
		implements PictumPlaceholderElement
	{
		static observedAttributes = [
			...IMAGE_ATTRIBUTES,
			"background",
			"base-url",
			"color",
			"density",
			"format",
			"size",
			"text",
		];
		static override elementProperties = [
			"alt",
			"background",
			"baseUrl",
			"color",
			"density",
			"format",
			"height",
			"size",
			"text",
			"width",
		];

		get size(): number | null {
			return readNumberAttribute(this, "size");
		}

		set size(value: number | null) {
			this.reflectNumber("size", value);
		}

		get width(): number | null {
			return readNumberAttribute(this, "width");
		}

		set width(value: number | null) {
			this.reflectNumber("width", value);
		}

		get height(): number | null {
			return readNumberAttribute(this, "height");
		}

		set height(value: number | null) {
			this.reflectNumber("height", value);
		}

		get format(): PlaceholderFormat | null {
			return this.getAttribute("format") as PlaceholderFormat | null;
		}

		set format(value: PlaceholderFormat | null) {
			this.reflectString("format", value);
		}

		get density(): PlaceholderDensity | null {
			return readNumberAttribute(this, "density") as PlaceholderDensity | null;
		}

		set density(value: PlaceholderDensity | null) {
			this.reflectNumber("density", value);
		}

		get background(): string | null {
			return this.getAttribute("background");
		}

		set background(value: string | null) {
			this.reflectString("background", value);
		}

		get color(): string | null {
			return this.getAttribute("color");
		}

		set color(value: string | null) {
			this.reflectString("color", value);
		}

		get text(): string | null {
			return this.getAttribute("text");
		}

		set text(value: string | null) {
			this.reflectString("text", value);
		}

		protected override performRender(): void {
			const dimensions =
				this.size === null
					? { width: this.width as number, height: this.height as number }
					: { size: this.size };
			const options = {
				...this.pictumOptions,
				...dimensions,
				...(this.format === null ? {} : { format: this.format }),
				...(this.density === null ? {} : { density: this.density }),
				...(this.background === null ? {} : { background: this.background }),
				...(this.color === null ? {} : { color: this.color }),
				...(this.text === null ? {} : { text: this.text }),
			} as PlaceholderOptions;
			const asset = placeholder(options);
			const width = this.size ?? (this.width as number);
			const height = this.size ?? (this.height as number);
			this.renderImage(asset.url, { width, height });
		}
	}

	return {
		"pictum-avatar": PictumAvatarElementClass,
		"pictum-icon": PictumIconElementClass,
		"pictum-placeholder": PictumPlaceholderElementClass,
		"pictum-qr-code": PictumQrCodeElementClass,
	};
}

function readBooleanAttribute(element: Element, name: string): boolean | null {
	const value = element.getAttribute(name);
	return value === null ? null : value.trim().toLowerCase() !== "false";
}

function readNumberAttribute(element: Element, name: string): number | null {
	const value = element.getAttribute(name);
	return value === null ? null : Number(value);
}

declare global {
	interface HTMLElementTagNameMap {
		"pictum-avatar": PictumAvatarElement;
		"pictum-icon": PictumIconElement;
		"pictum-placeholder": PictumPlaceholderElement;
		"pictum-qr-code": PictumQrCodeElement;
	}
}
