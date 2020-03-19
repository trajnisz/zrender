/**
 * RichText is a container that manages complex text label.
 * It will parse text string and create sub displayble elements respectively.
 */
import { PatternObject } from './Pattern';
import { LinearGradientObject } from './LinearGradient';
import { RadialGradientObject } from './RadialGradient';
import { TextAlign, VerticalAlign, ImageLike, Dictionary, AllPropTypes } from '../core/types';
import Element, { ElementProps } from '../Element';
import { parseRichText, parsePlainText } from './helper/parseText';
import ZText from './Text';
import { retrieve2, isString, each, normalizeCssArray, trim } from '../core/util';
import { DEFAULT_FONT, adjustTextX, adjustTextY } from '../contain/text';
import { GradientObject } from './Gradient';
import ZImage from './Image';
import Rect from './shape/Rect';
import BoundingRect from '../core/BoundingRect';
import { MatrixArray } from '../core/matrix';

type RichTextContentBlock = ReturnType<typeof parseRichText>
type RichTextLine = RichTextContentBlock['lines'][0]
type RichTextToken = RichTextLine['tokens'][0]

// TODO Default value?
interface RichTextStyleOptionPart {
    // TODO Text is assigned inside zrender
    text?: string
    // TODO Text not support PatternObject | LinearGradientObject | RadialGradientObject yet.
    fill?: string | PatternObject | LinearGradientObject | RadialGradientObject
    stroke?: string | PatternObject | LinearGradientObject | RadialGradientObject

    opacity?: number
    fillOpacity?: number
    strokeOpacity?: number
    /**
     * textStroke may be set as some color as a default
     * value in upper applicaion, where the default value
     * of lineWidth should be 0 to make sure that
     * user can choose to do not use text stroke.
     */
    lineWidth?: number

    /**
     * If `fontSize` or `fontFamily` exists, `font` will be reset by
     * `fontSize`, `fontStyle`, `fontWeight`, `fontFamily`.
     * So do not visit it directly in upper application (like echarts),
     * but use `contain/text#makeFont` instead.
     */
    font?: string
    /**
     * The same as font. Use font please.
     * @deprecated
     */
    textFont?: string

    /**
     * It helps merging respectively, rather than parsing an entire font string.
     */
    fontStyle?: string
    /**
     * It helps merging respectively, rather than parsing an entire font string.
     */
    fontWeight?: string
    /**
     * It helps merging respectively, rather than parsing an entire font string.
     */
    fontFamily?: string
    /**
     * It helps merging respectively, rather than parsing an entire font string.
     * Should be 12 but not '12px'.
     */
    fontSize?: number

    textAlign?: TextAlign
    verticalAlign?: VerticalAlign

    /**
     * Line height. Default to be text height of '国'
     */
    lineHeight?: number
    /**
     * Width of text block. Not include padding
     * Used for background, truncate, wrap
     */
    width?: number | string
    /**
     * Height of text block. Not include padding
     * Used for background, truncate
     */
    height?: number
    /**
     * Reserved for special functinality, like 'hr'.
     */
    textTag?: string

    textShadowColor?: string
    textShadowBlur?: number
    textShadowOffsetX?: number
    textShadowOffsetY?: number

    // Shadow, background, border of text box.
    backgroundColor?: string | {
        image: ImageLike | string
    }

    /**
     * Can be `2` or `[2, 4]` or `[2, 3, 4, 5]`
     */
    padding?: number | number[]

    borderColor?: string
    borderWidth?: number
    borderRadius?: number | number[]

    boxShadowColor?: string
    boxShadowBlur?: number
    boxShadowOffsetX?: number
    boxShadowOffsetY?: number
}
export interface RichTextStyleOption extends RichTextStyleOptionPart {

    text?: string

    x?: number
    y?: number

    /**
     * Only support number in the top block.
     */
    width?: number
    /**
     * Text styles for rich text.
     */
    rich?: Dictionary<RichTextStyleOptionPart>

    /**
     * Strategy when calculated text width exceeds textWidth.
     * Do nothing if not set
     */
    overflow?: 'wrap' | 'truncate'

    /**
     * Strategy when text lines exceeds textHeight.
     */
    lineOverflow?: 'truncate'

    /**
     * Epllipsis used if text is truncated
     */
    ellipsis: string
    /**
     * Placeholder used if text is truncated to empty
     */
    placeholder: string
    /**
     * Min characters for truncating
     */
    truncateMinChar: number
}

interface RichTextOption extends ElementProps {
    style?: RichTextStyleOption

    zlevel?: number
    z?: number
    z2?: number

    culling?: boolean
    cursor?: string
}

class RichText extends Element<RichTextOption> {

    type = 'richtext'

    zlevel: number
    z: number
    z2: number

    culling: boolean
    cursor: string

    // TODO RichText is Group?
    readonly isGroup = true

    style: RichTextStyleOption

    private _children: (ZImage | Rect | ZText)[] = []

    private _styleChanged = true

    private _rect: BoundingRect

    private _childCursor: 0

    constructor(opts?: RichTextOption) {
        super();
        this.attr(opts);
    }

    childrenRef() {
        return this._children;
    }

    traverse<Context>(
        cb: (this: Context, el: RichText) => void,
        context: Context
    ) {
        cb.call(context, this);
    }

    update() {
        // Update children
        if (this._styleChanged) {
            // Reset child visit cursor
            this._childCursor = 0;

            normalizeTextStyle(this.style);
            this.style.rich
                ? this._updateRichTexts()
                : this._updatePlainTexts();

            this._children.length = this._childCursor;

            for (let i = 0; i < this._children.length; i++) {
                const child = this._children[i];
                // Set common properties.
                if (this.z != null) {
                    child.zlevel = this.zlevel;
                }
                if (this.z != null) {
                    child.z = this.z;
                }
                if (this.z2 != null) {
                    child.z2 = this.z2;
                }
                if (this.culling != null) {
                    child.culling = this.culling;
                }
                if (this.cursor != null) {
                    child.cursor = this.cursor;
                }
            }
        }
        super.update();
    }

    attrKV(key: keyof RichTextOption, value: AllPropTypes<RichTextOption>) {
        if (key !== 'style') {
            super.attrKV(key as keyof ElementProps, value);
        }
        else {
            if (!this.style) {
                this.style = value as RichTextStyleOption;
            }
            else {
                this.setStyle(value as RichTextStyleOption);
            }
        }
    }

    setStyle(obj: RichTextStyleOption): void
    setStyle(obj: keyof RichTextStyleOption, value: any): void
    setStyle(obj: keyof RichTextStyleOption | RichTextStyleOption, value?: AllPropTypes<RichTextStyleOption>) {
        if (typeof obj === 'string') {
            (this.style as Dictionary<any>)[obj] = value;
        }
        else {
            for (let key in obj) {
                if (obj.hasOwnProperty(key)) {
                    (this.style as Dictionary<any>)[key] = (obj as Dictionary<any>)[key];
                }
            }
        }
        this.dirty();
        return this;
    }

    dirtyStyle() {
        this._rect = null;
        this._styleChanged = true;
        this.dirty();
    }

    getBoundingRect(): BoundingRect {
        if (!this._rect) {
            const tmpRect = new BoundingRect(0, 0, 0, 0);
            const children = this._children;
            const tmpMat: MatrixArray = [];
            let rect = null;

            for (let i = 0; i < children.length; i++) {
                const child = children[i];
                const childRect = child.getBoundingRect();
                const transform = child.getLocalTransform(tmpMat);

                if (transform) {
                    tmpRect.copy(childRect);
                    tmpRect.applyTransform(transform);
                    rect = rect || tmpRect.clone();
                    rect.union(tmpRect);
                }
                else {
                    rect = rect || childRect.clone();
                    rect.union(childRect);
                }
            }
            this._rect = rect || tmpRect;
        }
        return this._rect;
    }

    /**
     * Alias for animate('style')
     * @param loop
     */
    animateStyle(loop: boolean) {
        return this.animate('style', loop);
    }


    private _getOrCreateChild(Ctor: {new(): ZText}): ZText
    private _getOrCreateChild(Ctor: {new(): ZImage}): ZImage
    private _getOrCreateChild(Ctor: {new(): Rect}): Rect
    private _getOrCreateChild(Ctor: {new(): ZText | Rect | ZImage}): ZText | Rect | ZImage {
        let child = this._children[this._childCursor];
        if (!child || !(child instanceof Ctor)) {
            child = new Ctor();
        }
        this._children[this._childCursor++] = child;
        child.parent = this;
        return child;
    }

    private _updatePlainTexts() {
        const style = this.style;
        const text = style.text || '';
        const textFont = style.font || DEFAULT_FONT;
        const textPadding = style.padding as number[];

        const contentBlock = parsePlainText(text, style);
        const needDrawBg = needDrawBackground(style);

        let outerHeight = contentBlock.outerHeight;

        const textLines = contentBlock.lines;
        const lineHeight = contentBlock.lineHeight;

        const baseX = style.x || 0;
        const baseY = style.y || 0;
        const textAlign = style.textAlign || 'left';
        const textVerticalAlign = style.verticalAlign;

        const boxY = adjustTextY(baseY, outerHeight, textVerticalAlign);
        let textX = baseX;
        let textY = boxY;

        if (needDrawBg || textPadding) {
            // Consider performance, do not call getTextWidth util necessary.
            let outerWidth = contentBlock.width;
            textPadding && (outerWidth += textPadding[1] + textPadding[3]);
            const boxX = adjustTextX(baseX, outerWidth, textAlign);

            needDrawBg && this._renderBackground(style, boxX, boxY, outerWidth, outerHeight);

            if (textPadding) {
                textX = getTextXForPadding(baseX, textAlign, textPadding);
                textY += textPadding[0];
            }
        }

        // `textBaseline` is set as 'middle'.
        textY += lineHeight / 2;

        const textStrokeLineWidth = style.lineWidth;
        const textStroke = getStroke(style.stroke, textStrokeLineWidth);
        const textFill = getFill(style.fill);

        const hasStroke = 'stroke' in style;
        const hasFill = 'fill' in style;
        const hasShadow = style.textShadowBlur > 0;

        for (let i = 0; i < textLines.length; i++) {
            const el = this._getOrCreateChild(ZText);
            const subElStyle = el.style;
            subElStyle.text = textLines[i];
            subElStyle.x = textX;
            subElStyle.y = textY;
            // Always set textAlign and textBase line, because it is difficute to calculate
            // textAlign from prevEl, and we dont sure whether textAlign will be reset if
            // font set happened.
            if (textAlign) {
                subElStyle.textAlign = textAlign;
            }
            // Force baseline to be "middle". Otherwise, if using "top", the
            // text will offset downward a little bit in font "Microsoft YaHei".
            subElStyle.textBaseline = 'middle';
            subElStyle.opacity = style.opacity;
            // Fill after stroke so the outline will not cover the main part.
            subElStyle.strokeFirst = true;

            if (hasShadow) {
                subElStyle.shadowBlur = style.textShadowBlur || 0;
                subElStyle.shadowColor = style.textShadowColor || 'transparent';
                subElStyle.shadowOffsetX = style.textShadowOffsetX || 0;
                subElStyle.shadowOffsetY = style.textShadowOffsetY || 0;
            }

            if (hasStroke) {
                subElStyle.stroke = textStroke as string;
                subElStyle.lineWidth = textStrokeLineWidth;
            }
            if (hasFill) {
                subElStyle.fill = textFill as string;
            }

            subElStyle.font = textFont;

            textY += lineHeight;
        }
    }


    private _updateRichTexts() {
        const style = this.style;

        // TODO Only parse when text changed?
        const contentBlock = parseRichText(style.text || '', style);

        const contentWidth = contentBlock.width;
        const outerWidth = contentBlock.outerWidth;
        const outerHeight = contentBlock.outerHeight;
        const textPadding = style.padding as number[];

        const baseX = style.x || 0;
        const baseY = style.y || 0;
        const textAlign = style.textAlign;
        const textVerticalAlign = style.verticalAlign;

        const boxX = adjustTextX(baseX, outerWidth, textAlign);
        const boxY = adjustTextY(baseY, outerHeight, textVerticalAlign);
        let xLeft = boxX;
        let lineTop = boxY;
        if (textPadding) {
            xLeft += textPadding[3];
            lineTop += textPadding[0];
        }
        const xRight = xLeft + contentWidth;

        if (needDrawBackground(style)) {
            this._renderBackground(style, boxX, boxY, outerWidth, outerHeight);
        }

        for (let i = 0; i < contentBlock.lines.length; i++) {
            const line = contentBlock.lines[i];
            const tokens = line.tokens;
            const tokenCount = tokens.length;
            const lineHeight = line.lineHeight;

            let usedWidth = line.width;
            let leftIndex = 0;
            let lineXLeft = xLeft;
            let lineXRight = xRight;
            let rightIndex = tokenCount - 1;
            let token;

            while (
                leftIndex < tokenCount
                && (token = tokens[leftIndex], !token.textAlign || token.textAlign === 'left')
            ) {
                this._placeToken(token, style, lineHeight, lineTop, lineXLeft, 'left');
                usedWidth -= token.width;
                lineXLeft += token.width;
                leftIndex++;
            }

            while (
                rightIndex >= 0
                && (token = tokens[rightIndex], token.textAlign === 'right')
            ) {
                this._placeToken(token, style, lineHeight, lineTop, lineXRight, 'right');
                usedWidth -= token.width;
                lineXRight -= token.width;
                rightIndex--;
            }

            // The other tokens are placed as textAlign 'center' if there is enough space.
            lineXLeft += (contentWidth - (lineXLeft - xLeft) - (xRight - lineXRight) - usedWidth) / 2;
            while (leftIndex <= rightIndex) {
                token = tokens[leftIndex];
                // Consider width specified by user, use 'center' rather than 'left'.
                this._placeToken(token, style, lineHeight, lineTop, lineXLeft + token.width / 2, 'center');
                lineXLeft += token.width;
                leftIndex++;
            }

            lineTop += lineHeight;
        }
    }

    private _placeToken(
        token: RichTextToken,
        style: RichTextStyleOption,
        lineHeight: number,
        lineTop: number,
        x: number,
        textAlign: string
    ) {
        const tokenStyle = style.rich[token.styleName] || {};
        tokenStyle.text = token.text;

        // 'ctx.textBaseline' is always set as 'middle', for sake of
        // the bias of "Microsoft YaHei".
        const textVerticalAlign = token.textVerticalAlign;
        let y = lineTop + lineHeight / 2;
        if (textVerticalAlign === 'top') {
            y = lineTop + token.height / 2;
        }
        else if (textVerticalAlign === 'bottom') {
            y = lineTop + lineHeight - token.height / 2;
        }

        !token.isLineHolder && needDrawBackground(tokenStyle) && this._renderBackground(
            tokenStyle,
            textAlign === 'right'
                ? x - token.width
                : textAlign === 'center'
                ? x - token.width / 2
                : x,
            y - token.height / 2,
            token.width,
            token.height
        );

        const textPadding = token.textPadding;
        if (textPadding) {
            x = getTextXForPadding(x, textAlign, textPadding);
            y -= token.height / 2 - textPadding[2] - token.height / 2;
        }

        const el = this._getOrCreateChild(ZText);
        const subElStyle = el.style;

        const hasStroke = 'stroke' in tokenStyle || 'stroke' in style;
        const hasFill = 'fill' in tokenStyle || 'fill' in style;
        const hasShadow = tokenStyle.textShadowBlur > 0
                    || style.textShadowBlur > 0;

        subElStyle.text = token.text;
        subElStyle.x = x;
        subElStyle.y = y;
        if (hasShadow) {
            subElStyle.shadowBlur = tokenStyle.textShadowBlur || style.textShadowBlur || 0;
            subElStyle.shadowColor = tokenStyle.textShadowColor || style.textShadowColor || 'transparent';
            subElStyle.shadowOffsetX = tokenStyle.textShadowOffsetX || style.textShadowOffsetX || 0;
            subElStyle.shadowOffsetY = tokenStyle.textShadowOffsetY || style.textShadowOffsetY || 0;
        }

        subElStyle.textAlign = textAlign as CanvasTextAlign;
        // Force baseline to be "middle". Otherwise, if using "top", the
        // text will offset downward a little bit in font "Microsoft YaHei".
        subElStyle.textBaseline = 'middle';
        subElStyle.font = token.font || DEFAULT_FONT;

        if (hasStroke) {
            subElStyle.lineWidth = retrieve2(tokenStyle.lineWidth, style.lineWidth);
            subElStyle.stroke = getStroke(tokenStyle.stroke || style.stroke, subElStyle.lineWidth) || null;
        }
        if (hasFill) {
            subElStyle.fill = getFill(tokenStyle.fill || style.fill) || null;
        }
    }

    private _renderBackground(
        style: RichTextStyleOptionPart,
        x: number,
        y: number,
        width: number,
        height: number
    ) {
        const textBackgroundColor = style.backgroundColor;
        const textBorderWidth = style.borderWidth;
        const textBorderColor = style.borderColor;
        const isPlainBg = isString(textBackgroundColor);
        const textBorderRadius = style.borderRadius;
        const self = this;

        let rectEl: Rect;
        let imgEl: ZImage;
        if (isPlainBg || (textBorderWidth && textBorderColor)) {
            // Background is color
            rectEl = this._getOrCreateChild(Rect);
            rectEl.style.fill = null;
            const rectShape = rectEl.shape;
            rectShape.x = x;
            rectShape.y = y;
            rectShape.width = width;
            rectShape.height = height;
            rectShape.r = textBorderRadius;
            rectEl.dirtyShape();
        }

        if (isPlainBg) {
            const rectStyle = rectEl.style;
            rectStyle.fill = textBackgroundColor as string || null;
            rectStyle.opacity = retrieve2(style.opacity, 1);
            rectStyle.fillOpacity = retrieve2(style.fillOpacity, 1);
        }
        else if (textBackgroundColor && (textBackgroundColor as {image: ImageLike}).image) {
            imgEl = this._getOrCreateChild(ZImage);
            imgEl.onload = function () {
                // Refresh and relayout after image loaded.
                self.dirtyStyle();
            };
            const imgStyle = imgEl.style;
            imgStyle.image = (textBackgroundColor as {image: ImageLike}).image;
            imgStyle.x = x;
            imgStyle.y = y;
            imgStyle.width = width;
            imgStyle.height = height;
        }

        if (textBorderWidth && textBorderColor) {
            const rectStyle = rectEl.style;
            rectStyle.lineWidth = textBorderWidth;
            rectStyle.stroke = textBorderColor;
            rectStyle.strokeOpacity = retrieve2(style.strokeOpacity, 1);
        }

        const shadowStyle = (rectEl || imgEl).style;
        shadowStyle.shadowBlur = style.boxShadowBlur || 0;
        shadowStyle.shadowColor = style.boxShadowColor || 'transparent';
        shadowStyle.shadowOffsetX = style.boxShadowOffsetX || 0;
        shadowStyle.shadowOffsetY = style.boxShadowOffsetY || 0;

    }
}


const VALID_TEXT_ALIGN = {left: true, right: 1, center: 1};
const VALID_TEXT_VERTICAL_ALIGN = {top: 1, bottom: 1, middle: 1};

export function normalizeTextStyle(style: RichTextStyleOption): RichTextStyleOption {
    normalizeStyle(style);
    each(style.rich, normalizeStyle);
    return style;
}

function normalizeStyle(style: RichTextStyleOptionPart) {
    if (style) {
        style.font = makeFont(style);
        let textAlign = style.textAlign;
        // 'middle' is invalid, convert it to 'center'
        (textAlign as string) === 'middle' && (textAlign = 'center');
        style.textAlign = (
            textAlign == null || VALID_TEXT_ALIGN[textAlign]
        ) ? textAlign : 'left';

        // Compatible with textBaseline.
        let textVerticalAlign = style.verticalAlign;
        (textVerticalAlign as string) === 'center' && (textVerticalAlign = 'middle');
        style.verticalAlign = (
            textVerticalAlign == null || VALID_TEXT_VERTICAL_ALIGN[textVerticalAlign]
        ) ? textVerticalAlign : 'top';

        // TODO Should not change the orignal value.
        const textPadding = style.padding;
        if (textPadding) {
            style.padding = normalizeCssArray(style.padding);
        }
    }
}

/**
 * @param stroke If specified, do not check style.textStroke.
 * @param lineWidth If specified, do not check style.textStroke.
 */
function getStroke(
    stroke?: RichTextStyleOptionPart['stroke'],
    lineWidth?: number
) {
    return (stroke == null || lineWidth <= 0 || stroke === 'transparent' || stroke === 'none')
        ? null
        : ((stroke as PatternObject).image || (stroke as GradientObject).colorStops)
        ? '#000'
        : stroke;
}

function getFill(
    fill?: RichTextStyleOptionPart['fill']
) {
    return (fill == null || fill === 'none')
        ? null
        // TODO pattern and gradient?
        : ((fill as PatternObject).image || (fill as GradientObject).colorStops)
        ? '#000'
        : fill;
}

function getTextXForPadding(x: number, textAlign: string, textPadding: number[]): number {
    return textAlign === 'right'
        ? (x - textPadding[1])
        : textAlign === 'center'
        ? (x + textPadding[3] / 2 - textPadding[1] / 2)
        : (x + textPadding[3]);
}

/**
 * If needs draw background
 * @param style Style of element
 */
function needDrawBackground(style: RichTextStyleOptionPart): boolean {
    return !!(
        style.backgroundColor
        || (style.borderWidth && style.borderColor)
    );
}

function makeFont(
    style: RichTextStyleOptionPart
): string {
    // FIXME in node-canvas fontWeight is before fontStyle
    // Use `fontSize` `fontFamily` to check whether font properties are defined.
    const font = (style.fontSize || style.fontFamily) && [
        style.fontStyle,
        style.fontWeight,
        (style.fontSize || 12) + 'px',
        // If font properties are defined, `fontFamily` should not be ignored.
        style.fontFamily || 'sans-serif'
    ].join(' ');
    return font && trim(font) || style.textFont || style.font;
}


export default RichText;