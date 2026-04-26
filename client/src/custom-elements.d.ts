import type * as React from 'react'

type IconifyIconProps = React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
  icon?: string
  'stroke-width'?: string | number
  strokeWidth?: string | number
}

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'iconify-icon': IconifyIconProps
    }
  }
}

declare module 'react/jsx-runtime' {
  namespace JSX {
    interface IntrinsicElements {
      'iconify-icon': IconifyIconProps
    }
  }
}

export {}

