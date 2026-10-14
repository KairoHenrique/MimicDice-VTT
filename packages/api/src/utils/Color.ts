const CHANNEL_MAXIMUM = 255;

function clampUnit(value: number): number {
  return Math.min(Math.max(Number(value) || 0, 0), 1);
}

/** A 24-bit RGB color stored as its integer value, with conversions to CSS strings and 0-1 channel arrays. */
export class Color extends Number {
  static from(value: unknown): Color {
    if (value instanceof Color) return value;
    if (value === null || value === undefined || value === "") return new this(Number.NaN);
    if (typeof value === "string") return this.fromString(value);
    if (Array.isArray(value)) return this.fromRGB(value as [number, number, number]);
    if (typeof value === "object" && value !== null && "r" in value) {
      const { r, g, b } = value as { r: number; g: number; b: number };
      return this.fromRGB([r, g, b]);
    }
    return new this(Number(value));
  }

  static fromString(value: string): Color {
    const hex = String(value).trim().replace(/^#/, "");
    const expanded = hex.length === 3 ? hex.replace(/./g, (character) => character + character) : hex.slice(0, 6);
    return new this(/^[0-9a-f]{6}$/i.test(expanded) ? parseInt(expanded, 16) : Number.NaN);
  }

  static fromRGB([red, green, blue]: [number, number, number]): Color {
    return new this((Math.round(clampUnit(red) * CHANNEL_MAXIMUM) << 16) + (Math.round(clampUnit(green) * CHANNEL_MAXIMUM) << 8) + Math.round(clampUnit(blue) * CHANNEL_MAXIMUM));
  }

  static fromRGBvalues(red: number, green: number, blue: number): Color {
    return this.fromRGB([red, green, blue]);
  }

  static mix(first: unknown, second: unknown, weight = 0.5): Color {
    return Color.from(first).mix(Color.from(second), weight);
  }

  get valid(): boolean {
    const value = this.valueOf();
    return Number.isInteger(value) && value >= 0 && value <= 0xffffff;
  }

  get r(): number {
    return ((this.valueOf() >> 16) & 0xff) / CHANNEL_MAXIMUM;
  }

  get g(): number {
    return ((this.valueOf() >> 8) & 0xff) / CHANNEL_MAXIMUM;
  }

  get b(): number {
    return (this.valueOf() & 0xff) / CHANNEL_MAXIMUM;
  }

  get rgb(): [number, number, number] {
    return [this.r, this.g, this.b];
  }

  get css(): string {
    return this.toString();
  }

  get littleEndian(): number {
    return ((this.valueOf() & 0xff) << 16) | (this.valueOf() & 0xff00) | ((this.valueOf() >> 16) & 0xff);
  }

  override toString(radix?: number): string {
    if (radix !== undefined) return this.valueOf().toString(radix);
    return this.valid ? `#${this.valueOf().toString(16).padStart(6, "0")}` : "";
  }

  toHTML(): string {
    return this.toString();
  }

  toJSON(): string {
    return this.toString();
  }

  toRGBA(alpha = 1): string {
    const [red, green, blue] = this.rgb.map((channel) => Math.round(channel * CHANNEL_MAXIMUM));
    return `rgba(${red}, ${green}, ${blue}, ${clampUnit(alpha)})`;
  }

  mix(other: Color, weight = 0.5): Color {
    const otherColor = Color.from(other);
    return Color.fromRGB(this.rgb.map((channel, index) => channel * (1 - weight) + otherColor.rgb[index] * weight) as [number, number, number]);
  }

  multiply(other: Color | number): Color {
    if (typeof other === "number") return Color.fromRGB(this.rgb.map((channel) => channel * other) as [number, number, number]);
    const otherColor = Color.from(other);
    return Color.fromRGB(this.rgb.map((channel, index) => channel * otherColor.rgb[index]) as [number, number, number]);
  }

  add(other: Color): Color {
    const otherColor = Color.from(other);
    return Color.fromRGB(this.rgb.map((channel, index) => channel + otherColor.rgb[index]) as [number, number, number]);
  }

  equals(other: unknown): boolean {
    return Color.from(other).valueOf() === this.valueOf();
  }

  applyRGB(target: number[]): void {
    target[0] = this.r;
    target[1] = this.g;
    target[2] = this.b;
  }
}
