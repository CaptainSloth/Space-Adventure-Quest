import React from 'react'

/**
 * Sansi color codes:
 * %0 - Black         %8 - Dark Gray
 * %1 - Red           %9 - Light Red
 * %2 - Green         %a - Light Green
 * %3 - Yellow        %b - Light Yellow
 * %4 - Blue          %c - Light Blue
 * %5 - Magenta       %d - Light Magenta
 * %6 - Cyan          %e - Light Cyan
 * %7 - White         %f - Bright White
 * 
 * ` - Toggle bold
 * ~ - Toggle blink
 */

export const parseSansi = (text: string): React.ReactNode[] => {
  const result: React.ReactNode[] = []
  let currentColorClass = 'sansi-7' // Default to white
  let isBold = false
  let isBlink = false

  // Regex to split on %X, ` and ~
  // Using a group so the tokens are included in the split result
  const tokens = text.split(/(%[0-9a-f]|`|~)/g)

  tokens.forEach((token, index) => {
    if (!token) return

    if (token.startsWith('%') && token.length === 2) {
      currentColorClass = `sansi-${token[1]}`
    } else if (token === '`') {
      isBold = !isBold
    } else if (token === '~') {
      isBlink = !isBlink
    } else {
      const classes = [currentColorClass]
      if (isBold) classes.push('sansi-bold')
      if (isBlink) classes.push('sansi-blink')

      result.push(
        <span key={`${index}-${token}`} className={classes.join(' ')}>
          {token}
        </span>
      )
    }
  })

  return result
}
