import { useCallback } from 'react'

export function useKeyboardHandlers(
  editorRef: React.RefObject<HTMLDivElement | null>,
  triggerAutoSave: () => void
) {
  const getCurrentLineText = useCallback(() => {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return ''
    const range = selection.getRangeAt(0)
    const node = range.startContainer
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent?.substring(0, range.startOffset) || ''
    }
    return ''
  }, [])

  const handleSpaceKey = useCallback((e: React.KeyboardEvent, selection: Selection) => {
    const lineText = getCurrentLineText()

    // Numbered list (1.)
    const numberedMatch = lineText.match(/^(\d+)\.$/)
    if (numberedMatch) {
      e.preventDefault()
      const range = selection.getRangeAt(0)
      const textNode = range.startContainer as Text
      const fullPattern = numberedMatch[0]
      let blockEl: HTMLElement | null = null
      let currentNode: Node | null = textNode

      while (currentNode && currentNode !== editorRef.current) {
        if (currentNode.nodeType === Node.ELEMENT_NODE) {
          const el = currentNode as HTMLElement
          const tag = el.tagName.toLowerCase()
          if (tag === 'div' || tag === 'p' || tag === 'li') {
            blockEl = el
            break
          }
        }
        currentNode = currentNode.parentNode
      }

      const lineStart = (textNode.textContent || '').indexOf(fullPattern)
      if (lineStart >= 0) {
        range.setStart(textNode, lineStart)
        range.setEnd(textNode, lineStart + fullPattern.length)
        range.deleteContents()
      }

      const ol = document.createElement('ol')
      const li = document.createElement('li')

      if (blockEl && blockEl.tagName.toLowerCase() !== 'li') {
        while (blockEl.firstChild) li.appendChild(blockEl.firstChild)
        if (!li.textContent?.trim()) li.innerHTML = '<br>'
        ol.appendChild(li)
        blockEl.replaceWith(ol)
      } else if (!blockEl) {
        li.innerHTML = '<br>'
        ol.appendChild(li)
        range.insertNode(ol)
      }

      const newRange = document.createRange()
      newRange.selectNodeContents(li)
      newRange.collapse(true)
      selection.removeAllRanges()
      selection.addRange(newRange)
      triggerAutoSave()
      return true
    }

    // Nested numbering (1.1.)
    const nestedMatch = lineText.match(/^(\d+\.\d+)\.?$/)
    if (nestedMatch) {
      e.preventDefault()
      const range = selection.getRangeAt(0)
      const textNode = range.startContainer as Text
      let blockEl: HTMLElement | null = null
      let currentNode: Node | null = textNode

      while (currentNode && currentNode !== editorRef.current) {
        if (currentNode.nodeType === Node.ELEMENT_NODE) {
          const el = currentNode as HTMLElement
          const tag = el.tagName.toLowerCase()
          if (tag === 'div' || tag === 'p' || tag === 'li') {
            blockEl = el
            break
          }
        }
        currentNode = currentNode.parentNode
      }

      const newDiv = document.createElement('div')
      newDiv.style.marginLeft = '32px'
      newDiv.innerHTML = nestedMatch[1] + '.&nbsp;'

      if (blockEl) blockEl.replaceWith(newDiv)
      else {
        range.deleteContents()
        range.insertNode(newDiv)
      }

      const newRange = document.createRange()
      newRange.selectNodeContents(newDiv)
      newRange.collapse(false)
      selection.removeAllRanges()
      selection.addRange(newRange)
      triggerAutoSave()
      return true
    }

    // Bullet list (* or -)
    if (/^[\*\-]$/.test(lineText)) {
      e.preventDefault()
      const range = selection.getRangeAt(0)
      const textNode = range.startContainer as Text
      let blockEl: HTMLElement | null = null
      let currentNode: Node | null = textNode

      while (currentNode && currentNode !== editorRef.current) {
        if (currentNode.nodeType === Node.ELEMENT_NODE) {
          const el = currentNode as HTMLElement
          const tag = el.tagName.toLowerCase()
          if (tag === 'div' || tag === 'p' || tag === 'li') {
            blockEl = el
            break
          }
        }
        currentNode = currentNode.parentNode
      }

      const lineStart = (textNode.textContent || '').indexOf(lineText)
      if (lineStart >= 0) {
        range.setStart(textNode, lineStart)
        range.setEnd(textNode, lineStart + lineText.length)
        range.deleteContents()
      }

      const ul = document.createElement('ul')
      const li = document.createElement('li')

      if (blockEl && blockEl.tagName.toLowerCase() !== 'li') {
        while (blockEl.firstChild) li.appendChild(blockEl.firstChild)
        if (!li.textContent?.trim()) li.innerHTML = '<br>'
        ul.appendChild(li)
        blockEl.replaceWith(ul)
      } else if (!blockEl) {
        li.innerHTML = '<br>'
        ul.appendChild(li)
        range.insertNode(ul)
      }

      const newRange = document.createRange()
      newRange.selectNodeContents(li)
      newRange.collapse(true)
      selection.removeAllRanges()
      selection.addRange(newRange)
      triggerAutoSave()
      return true
    }

    return false
  }, [editorRef, getCurrentLineText, triggerAutoSave])

  const handleEnterKey = useCallback((e: React.KeyboardEvent, selection: Selection, node: Node | null) => {
    // Check for nested div with margin (nested numbering)
    let nestedDiv: HTMLElement | null = null
    let currentCheck: Node | null = node

    while (currentCheck && currentCheck !== editorRef.current) {
      if (currentCheck.nodeType === Node.ELEMENT_NODE) {
        const el = currentCheck as HTMLElement
        if (el.tagName === 'DIV' && el.style.marginLeft) {
          nestedDiv = el
          break
        }
      }
      currentCheck = currentCheck.parentNode
    }

    if (nestedDiv) {
      const text = nestedDiv.textContent || ''
      const nestedNumMatch = text.match(/^(\d+)\.(\d+)\.\s*(.*)$/)

      if (nestedNumMatch) {
        e.preventDefault()
        const mainNum = parseInt(nestedNumMatch[1])
        const subNum = parseInt(nestedNumMatch[2])
        const restText = nestedNumMatch[3]?.trim() || ''

        if (!restText) {
          const ol = document.createElement('ol')
          ol.start = mainNum + 1
          const li = document.createElement('li')
          li.innerHTML = '<br>'
          ol.appendChild(li)
          nestedDiv.replaceWith(ol)

          const newRange = document.createRange()
          newRange.selectNodeContents(li)
          newRange.collapse(true)
          selection.removeAllRanges()
          selection.addRange(newRange)
        } else {
          const newDiv = document.createElement('div')
          newDiv.style.marginLeft = '32px'
          newDiv.innerHTML = `${mainNum}.${subNum + 1}.&nbsp;`
          nestedDiv.after(newDiv)

          const newRange = document.createRange()
          newRange.selectNodeContents(newDiv)
          newRange.collapse(false)
          selection.removeAllRanges()
          selection.addRange(newRange)
        }
        triggerAutoSave()
        return true
      }
    }

    // Todo item handling
    const todoItem = node?.parentElement?.closest('.todo-item')
    if (todoItem) {
      e.preventDefault()
      const textSpan = todoItem.querySelector('.todo-text')
      const isEmpty = !textSpan?.textContent?.trim()

      if (isEmpty) {
        const newDiv = document.createElement('div')
        newDiv.innerHTML = '<br>'
        todoItem.replaceWith(newDiv)

        const range = document.createRange()
        range.setStart(newDiv, 0)
        range.collapse(true)
        selection.removeAllRanges()
        selection.addRange(range)
      } else {
        const newTodo = document.createElement('div')
        newTodo.className = 'todo-item'

        const circle = document.createElement('span')
        circle.className = 'todo-circle'
        circle.contentEditable = 'false'

        const newTextSpan = document.createElement('span')
        newTextSpan.className = 'todo-text'
        newTextSpan.innerHTML = '<br>'

        newTodo.appendChild(circle)
        newTodo.appendChild(newTextSpan)
        todoItem.after(newTodo)

        const range = document.createRange()
        range.setStart(newTextSpan, 0)
        range.collapse(true)
        selection.removeAllRanges()
        selection.addRange(range)
      }
      triggerAutoSave()
      return true
    }

    // List item handling
    let listItem: HTMLElement | null = null
    let currentNode: Node | null = node

    while (currentNode && currentNode !== editorRef.current) {
      if (currentNode.nodeType === Node.ELEMENT_NODE) {
        const el = currentNode as HTMLElement
        if (el.tagName === 'LI') {
          listItem = el
          break
        }
      }
      currentNode = currentNode.parentNode
    }

    if (listItem) {
      const isEmpty = !listItem.textContent?.trim()
      if (isEmpty) {
        e.preventDefault()
        const list = listItem.parentElement

        if (list && (list.tagName === 'UL' || list.tagName === 'OL')) {
          const newDiv = document.createElement('div')
          newDiv.innerHTML = '<br>'

          if (list.children.length === 1) list.replaceWith(newDiv)
          else {
            listItem.remove()
            list.after(newDiv)
          }

          const range = document.createRange()
          range.setStart(newDiv, 0)
          range.collapse(true)
          selection.removeAllRanges()
          selection.addRange(range)
          triggerAutoSave()
        }
        return true
      }
    }

    return false
  }, [editorRef, triggerAutoSave])

  const handleBackspaceKey = useCallback((e: React.KeyboardEvent, selection: Selection, node: Node | null) => {
    const range = selection.getRangeAt(0)
    if (range.startOffset !== 0) return false

    let listItem: HTMLElement | null = null
    let currentNode: Node | null = node

    while (currentNode && currentNode !== editorRef.current) {
      if (currentNode.nodeType === Node.ELEMENT_NODE) {
        const el = currentNode as HTMLElement
        if (el.tagName === 'LI') {
          listItem = el
          break
        }
      }
      currentNode = currentNode.parentNode
    }

    if (listItem) {
      const textBefore = range.startContainer.textContent?.substring(0, range.startOffset) || ''
      if (textBefore) return false

      e.preventDefault()
      const list = listItem.parentElement
      if (!list || (list.tagName !== 'UL' && list.tagName !== 'OL')) return true

      const newDiv = document.createElement('div')
      while (listItem.firstChild) newDiv.appendChild(listItem.firstChild)
      if (!newDiv.textContent?.trim()) newDiv.innerHTML = '<br>'

      const isFirstItem = listItem === list.firstElementChild
      const isLastItem = listItem === list.lastElementChild

      if (list.children.length === 1) {
        list.replaceWith(newDiv)
      } else if (isFirstItem) {
        list.parentNode?.insertBefore(newDiv, list)
        listItem.remove()
      } else if (isLastItem) {
        list.after(newDiv)
        listItem.remove()
      } else {
        const newList = document.createElement(list.tagName)
        let sibling = listItem.nextElementSibling
        while (sibling) {
          const next = sibling.nextElementSibling
          newList.appendChild(sibling)
          sibling = next
        }
        list.after(newDiv)
        newDiv.after(newList)
        listItem.remove()
      }

      const newRange = document.createRange()
      newRange.selectNodeContents(newDiv)
      newRange.collapse(true)
      selection.removeAllRanges()
      selection.addRange(newRange)
      triggerAutoSave()
      return true
    }

    return false
  }, [editorRef, triggerAutoSave])

  const handleEditorKeyDown = useCallback((e: React.KeyboardEvent) => {
    const selection = window.getSelection()
    if (!selection || !editorRef.current) return

    const node = selection.anchorNode

    // Fix cursor position in todo-item
    if (node) {
      const parent = node.nodeType === Node.ELEMENT_NODE ? node as HTMLElement : node.parentElement
      if (parent?.classList.contains('todo-item')) {
        const textSpan = parent.querySelector('.todo-text')
        if (textSpan) {
          const range = document.createRange()
          range.selectNodeContents(textSpan)
          range.collapse(false)
          selection.removeAllRanges()
          selection.addRange(range)
        }
      }
    }

    if (e.key === ' ') {
      if (handleSpaceKey(e, selection)) return
    }

    if (e.key === 'Enter') {
      if (handleEnterKey(e, selection, node)) return
    }

    if (e.key === 'Backspace') {
      if (handleBackspaceKey(e, selection, node)) return
    }
  }, [editorRef, handleSpaceKey, handleEnterKey, handleBackspaceKey])

  return handleEditorKeyDown
}
