export const execCommand = (
  editorRef: React.RefObject<HTMLDivElement | null>,
  command: string,
  triggerAutoSave: () => void,
  value?: string
) => {
  if (command === 'insertUnorderedList' || command === 'insertOrderedList') {
    const selection = window.getSelection()
    if (selection && selection.rangeCount > 0) {
      let node: Node | null = selection.anchorNode
      while (node && node !== editorRef.current) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const el = node as HTMLElement
          if (el.classList.contains('todo-item')) {
            const textSpan = el.querySelector('.todo-text')
            const textContent = textSpan?.innerHTML || '<br>'
            const newDiv = document.createElement('div')
            newDiv.innerHTML = textContent
            el.replaceWith(newDiv)
            requestAnimationFrame(() => {
              const range = document.createRange()
              const textNode = newDiv.firstChild
              if (textNode) {
                range.selectNodeContents(textNode)
                range.collapse(false)
              } else {
                range.selectNodeContents(newDiv)
                range.collapse(false)
              }
              selection.removeAllRanges()
              selection.addRange(range)
              document.execCommand(command, false, value)
              editorRef.current?.focus()
              triggerAutoSave()
            })
            return
          }
        }
        node = node.parentNode
      }
    }
  }
  document.execCommand(command, false, value)
  editorRef.current?.focus()
  triggerAutoSave()
}

export const insertTodoItem = (
  editorRef: React.RefObject<HTMLDivElement | null>,
  triggerAutoSave: () => void
) => {
  const selection = window.getSelection()
  if (!selection || !editorRef.current || selection.rangeCount === 0) return

  let node: Node | null = selection.anchorNode
  let blockElement: HTMLElement | null = null

  while (node && node !== editorRef.current) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement
      const tagName = el.tagName.toLowerCase()
      if (tagName === 'div' || tagName === 'p' || tagName === 'li' || el.classList.contains('todo-item')) {
        blockElement = el
        break
      }
    }
    node = node.parentNode
  }

  if (blockElement?.classList.contains('todo-item')) {
    const textSpan = blockElement.querySelector('.todo-text')
    const newDiv = document.createElement('div')
    newDiv.innerHTML = textSpan?.innerHTML || '<br>'
    blockElement.replaceWith(newDiv)
    const range = document.createRange()
    range.selectNodeContents(newDiv)
    range.collapse(false)
    selection.removeAllRanges()
    selection.addRange(range)
    editorRef.current?.focus()
    triggerAutoSave()
    return
  }

  const todoDiv = document.createElement('div')
  todoDiv.className = 'todo-item'
  const circle = document.createElement('span')
  circle.className = 'todo-circle'
  circle.contentEditable = 'false'
  const textSpan = document.createElement('span')
  textSpan.className = 'todo-text'

  if (blockElement) {
    if (blockElement.tagName.toLowerCase() === 'li') {
      const list = blockElement.parentElement
      textSpan.innerHTML = blockElement.innerHTML || '<br>'
      todoDiv.appendChild(circle)
      todoDiv.appendChild(textSpan)
      if (list && (list.tagName === 'UL' || list.tagName === 'OL')) {
        if (list.children.length === 1) list.replaceWith(todoDiv)
        else blockElement.replaceWith(todoDiv)
      }
    } else {
      textSpan.innerHTML = blockElement.innerHTML || '<br>'
      todoDiv.appendChild(circle)
      todoDiv.appendChild(textSpan)
      blockElement.replaceWith(todoDiv)
    }
  } else {
    textSpan.innerHTML = '<br>'
    todoDiv.appendChild(circle)
    todoDiv.appendChild(textSpan)
    const range = selection.getRangeAt(0)
    range.deleteContents()
    range.insertNode(todoDiv)
  }

  const range = document.createRange()
  range.selectNodeContents(textSpan)
  range.collapse(false)
  selection.removeAllRanges()
  selection.addRange(range)
  editorRef.current?.focus()
  triggerAutoSave()
}

export const applyQuote = (
  editorRef: React.RefObject<HTMLDivElement | null>,
  triggerAutoSave: () => void,
  clearSelectionMenu: () => void
) => {
  const selection = window.getSelection()
  if (!selection || !editorRef.current) return

  let currentNode: Node | null = selection.anchorNode
  let existingQuote: HTMLElement | null = null

  while (currentNode && currentNode !== editorRef.current) {
    if (currentNode.nodeType === Node.ELEMENT_NODE) {
      const el = currentNode as HTMLElement
      if (el.classList.contains('quote-block') || el.tagName === 'BLOCKQUOTE') {
        existingQuote = el
        break
      }
    }
    currentNode = currentNode.parentNode
  }

  if (existingQuote) {
    const parent = existingQuote.parentNode
    if (parent) {
      while (existingQuote.firstChild) parent.insertBefore(existingQuote.firstChild, existingQuote)
      parent.removeChild(existingQuote)
    }
    clearSelectionMenu()
    triggerAutoSave()
    return
  }

  if (selection.isCollapsed) return

  const range = selection.getRangeAt(0)
  const fragment = range.cloneContents()
  if (fragment.querySelector('.quote-block, blockquote')) {
    clearSelectionMenu()
    return
  }

  const quote = document.createElement('blockquote')
  quote.className = 'quote-block'
  const contents = range.extractContents()
  quote.appendChild(contents)
  range.insertNode(quote)
  selection.removeAllRanges()
  clearSelectionMenu()
  triggerAutoSave()
}
