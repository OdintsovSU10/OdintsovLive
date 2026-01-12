import { useRef, useEffect, useCallback, useState } from 'react'
import { ArrowLeft, Pin, Trash2, Bold, Italic, Underline, Strikethrough, Type, List, ListOrdered, CheckCircle2, Quote } from 'lucide-react'

interface Note {
  id: string
  title: string
  content: string
  is_pinned: boolean
  created_at: string
}

interface Props {
  note: Note | null
  isSaving: boolean
  onSave: (content: string) => void
  onClose: () => void
  onDelete: (id: string) => void
  onPin: (id: string, isPinned: boolean) => void
}

export default function NotesEditor({ note, isSaving, onSave, onClose, onDelete, onPin }: Props) {
  const editorRef = useRef<HTMLDivElement>(null)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const [swipeBackProgress, setSwipeBackProgress] = useState(0)
  const [selectionMenu, setSelectionMenu] = useState<{ x: number; y: number } | null>(null)
  const selectionTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const editorSwipeStartX = useRef(0)
  const isEditorSwipe = useRef(false)
  const editorPageRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = note?.content || ''
      editorRef.current.focus()
    }
  }, [note?.id])

  useEffect(() => {
    document.body.dataset.notesEditor = 'true'
    const handleBackEvent = () => onClose()
    window.addEventListener('notes-editor-back', handleBackEvent)
    return () => {
      delete document.body.dataset.notesEditor
      window.removeEventListener('notes-editor-back', handleBackEvent)
    }
  }, [onClose])

  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0]
      document.body.dataset.editorSwipe = 'true'
      if (touch.clientX < 40) {
        editorSwipeStartX.current = touch.clientX
        isEditorSwipe.current = true
      }
    }
    const handleTouchMove = (e: TouchEvent) => {
      if (isEditorSwipe.current) {
        const diff = e.touches[0].clientX - editorSwipeStartX.current
        setSwipeBackProgress(Math.min(Math.max(diff / 150, 0), 1))
      }
    }
    const handleTouchEnd = () => {
      if (isEditorSwipe.current && swipeBackProgress > 0.5) {
        onClose()
      }
      editorSwipeStartX.current = 0
      isEditorSwipe.current = false
      setSwipeBackProgress(0)
      setTimeout(() => { delete document.body.dataset.editorSwipe }, 50)
    }
    document.addEventListener('touchstart', handleTouchStart, { capture: true, passive: true })
    document.addEventListener('touchmove', handleTouchMove, { passive: true })
    document.addEventListener('touchend', handleTouchEnd, { passive: true })
    return () => {
      document.removeEventListener('touchstart', handleTouchStart, { capture: true })
      document.removeEventListener('touchmove', handleTouchMove)
      document.removeEventListener('touchend', handleTouchEnd)
      delete document.body.dataset.editorSwipe
    }
  }, [swipeBackProgress, onClose])

  const triggerAutoSave = useCallback(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(() => {
      onSave(editorRef.current?.innerHTML || '')
    }, 500)
  }, [onSave])

  const execCommand = (command: string, value?: string) => {
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
                if (textNode) { range.selectNodeContents(textNode); range.collapse(false) }
                else { range.selectNodeContents(newDiv); range.collapse(false) }
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

  const insertTodoItem = () => {
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

  const handleEditorClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    setSelectionMenu(null)
    if (target.classList.contains('todo-circle')) {
      e.preventDefault()
      const todoItem = target.closest('.todo-item')
      if (todoItem) { todoItem.classList.toggle('completed'); triggerAutoSave() }
      return
    }
    if (target.classList.contains('todo-item')) {
      const textSpan = target.querySelector('.todo-text')
      if (textSpan) {
        const selection = window.getSelection()
        const range = document.createRange()
        range.selectNodeContents(textSpan)
        range.collapse(false)
        selection?.removeAllRanges()
        selection?.addRange(range)
      }
    }
  }

  const checkSelection = () => {
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed || !editorRef.current) { setSelectionMenu(null); return }
    const selectedText = selection.toString().trim()
    if (!selectedText) { setSelectionMenu(null); return }
    const range = selection.getRangeAt(0)
    if (!editorRef.current.contains(range.commonAncestorContainer)) { setSelectionMenu(null); return }
    const rect = range.getBoundingClientRect()
    setSelectionMenu({ x: rect.left + rect.width / 2, y: rect.top - 10 })
  }

  const handleSelectionChange = () => {
    if (selectionTimeoutRef.current) clearTimeout(selectionTimeoutRef.current)
    selectionTimeoutRef.current = setTimeout(checkSelection, 200)
  }

  const applyQuote = () => {
    const selection = window.getSelection()
    if (!selection || !editorRef.current) return
    let currentNode: Node | null = selection.anchorNode
    let existingQuote: HTMLElement | null = null
    while (currentNode && currentNode !== editorRef.current) {
      if (currentNode.nodeType === Node.ELEMENT_NODE) {
        const el = currentNode as HTMLElement
        if (el.classList.contains('quote-block') || el.tagName === 'BLOCKQUOTE') { existingQuote = el; break }
      }
      currentNode = currentNode.parentNode
    }
    if (existingQuote) {
      const parent = existingQuote.parentNode
      if (parent) {
        while (existingQuote.firstChild) parent.insertBefore(existingQuote.firstChild, existingQuote)
        parent.removeChild(existingQuote)
      }
      setSelectionMenu(null)
      triggerAutoSave()
      return
    }
    if (selection.isCollapsed) return
    const range = selection.getRangeAt(0)
    const fragment = range.cloneContents()
    if (fragment.querySelector('.quote-block, blockquote')) { setSelectionMenu(null); return }
    const quote = document.createElement('blockquote')
    quote.className = 'quote-block'
    const contents = range.extractContents()
    quote.appendChild(contents)
    range.insertNode(quote)
    selection.removeAllRanges()
    setSelectionMenu(null)
    triggerAutoSave()
  }

  const getCurrentLineText = () => {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return ''
    const range = selection.getRangeAt(0)
    const node = range.startContainer
    if (node.nodeType === Node.TEXT_NODE) return node.textContent?.substring(0, range.startOffset) || ''
    return ''
  }

  const handleEditorKeyDown = (e: React.KeyboardEvent) => {
    const selection = window.getSelection()
    if (!selection || !editorRef.current) return
    const node = selection.anchorNode
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
      const lineText = getCurrentLineText()
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
            if (tag === 'div' || tag === 'p' || tag === 'li') { blockEl = el; break }
          }
          currentNode = currentNode.parentNode
        }
        const lineStart = (textNode.textContent || '').indexOf(fullPattern)
        if (lineStart >= 0) { range.setStart(textNode, lineStart); range.setEnd(textNode, lineStart + fullPattern.length); range.deleteContents() }
        const ol = document.createElement('ol')
        const li = document.createElement('li')
        if (blockEl && blockEl.tagName.toLowerCase() !== 'li') {
          while (blockEl.firstChild) li.appendChild(blockEl.firstChild)
          if (!li.textContent?.trim()) li.innerHTML = '<br>'
          ol.appendChild(li)
          blockEl.replaceWith(ol)
        } else if (!blockEl) { li.innerHTML = '<br>'; ol.appendChild(li); range.insertNode(ol) }
        const newRange = document.createRange()
        newRange.selectNodeContents(li)
        newRange.collapse(true)
        selection.removeAllRanges()
        selection.addRange(newRange)
        triggerAutoSave()
        return
      }
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
            if (tag === 'div' || tag === 'p' || tag === 'li') { blockEl = el; break }
          }
          currentNode = currentNode.parentNode
        }
        const newDiv = document.createElement('div')
        newDiv.style.marginLeft = '32px'
        newDiv.innerHTML = nestedMatch[1] + '.&nbsp;'
        if (blockEl) blockEl.replaceWith(newDiv)
        else { range.deleteContents(); range.insertNode(newDiv) }
        const newRange = document.createRange()
        newRange.selectNodeContents(newDiv)
        newRange.collapse(false)
        selection.removeAllRanges()
        selection.addRange(newRange)
        triggerAutoSave()
        return
      }
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
            if (tag === 'div' || tag === 'p' || tag === 'li') { blockEl = el; break }
          }
          currentNode = currentNode.parentNode
        }
        const lineStart = (textNode.textContent || '').indexOf(lineText)
        if (lineStart >= 0) { range.setStart(textNode, lineStart); range.setEnd(textNode, lineStart + lineText.length); range.deleteContents() }
        const ul = document.createElement('ul')
        const li = document.createElement('li')
        if (blockEl && blockEl.tagName.toLowerCase() !== 'li') {
          while (blockEl.firstChild) li.appendChild(blockEl.firstChild)
          if (!li.textContent?.trim()) li.innerHTML = '<br>'
          ul.appendChild(li)
          blockEl.replaceWith(ul)
        } else if (!blockEl) { li.innerHTML = '<br>'; ul.appendChild(li); range.insertNode(ul) }
        const newRange = document.createRange()
        newRange.selectNodeContents(li)
        newRange.collapse(true)
        selection.removeAllRanges()
        selection.addRange(newRange)
        triggerAutoSave()
        return
      }
    }

    if (e.key === 'Enter') {
      let nestedDiv: HTMLElement | null = null
      let currentCheck: Node | null = node
      while (currentCheck && currentCheck !== editorRef.current) {
        if (currentCheck.nodeType === Node.ELEMENT_NODE) {
          const el = currentCheck as HTMLElement
          if (el.tagName === 'DIV' && el.style.marginLeft) { nestedDiv = el; break }
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
          return
        }
      }
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
        return
      }
      let listItem: HTMLElement | null = null
      let currentNode: Node | null = node
      while (currentNode && currentNode !== editorRef.current) {
        if (currentNode.nodeType === Node.ELEMENT_NODE) {
          const el = currentNode as HTMLElement
          if (el.tagName === 'LI') { listItem = el; break }
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
            else { listItem.remove(); list.after(newDiv) }
            const range = document.createRange()
            range.setStart(newDiv, 0)
            range.collapse(true)
            selection.removeAllRanges()
            selection.addRange(range)
            triggerAutoSave()
          }
        }
      }
    }

    if (e.key === 'Backspace') {
      const range = selection.getRangeAt(0)
      if (range.startOffset !== 0) return
      let listItem: HTMLElement | null = null
      let currentNode: Node | null = node
      while (currentNode && currentNode !== editorRef.current) {
        if (currentNode.nodeType === Node.ELEMENT_NODE) {
          const el = currentNode as HTMLElement
          if (el.tagName === 'LI') { listItem = el; break }
        }
        currentNode = currentNode.parentNode
      }
      if (listItem) {
        const textBefore = range.startContainer.textContent?.substring(0, range.startOffset) || ''
        if (textBefore) return
        e.preventDefault()
        const list = listItem.parentElement
        if (!list || (list.tagName !== 'UL' && list.tagName !== 'OL')) return
        const newDiv = document.createElement('div')
        while (listItem.firstChild) newDiv.appendChild(listItem.firstChild)
        if (!newDiv.textContent?.trim()) newDiv.innerHTML = '<br>'
        const isFirstItem = listItem === list.firstElementChild
        const isLastItem = listItem === list.lastElementChild
        if (list.children.length === 1) list.replaceWith(newDiv)
        else if (isFirstItem) { list.parentNode?.insertBefore(newDiv, list); listItem.remove() }
        else if (isLastItem) { list.after(newDiv); listItem.remove() }
        else {
          const newList = document.createElement(list.tagName)
          let sibling = listItem.nextElementSibling
          while (sibling) { const next = sibling.nextElementSibling; newList.appendChild(sibling); sibling = next }
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
      }
    }
  }

  return (
    <div
      className="notes-editor-page"
      ref={editorPageRef}
      style={{ transform: `translateX(${swipeBackProgress * 100}px)`, opacity: 1 - swipeBackProgress * 0.3 }}
    >
      <div className="editor-header">
        <button className="back-btn desktop-only" onClick={onClose}>
          <ArrowLeft size={20} />
          <span>Назад</span>
        </button>
        {note && (
          <div className="editor-header-actions mobile-only">
            <button className={`pin-btn ${note.is_pinned ? 'active' : ''}`} onClick={() => onPin(note.id, note.is_pinned)}>
              <Pin size={18} />
            </button>
            <button className="delete-btn" onClick={() => onDelete(note.id)}>
              <Trash2 size={18} />
            </button>
          </div>
        )}
        <div className="editor-status">{isSaving ? 'Сохранение...' : 'Сохранено'}</div>
      </div>

      <div className="editor-toolbar">
        <button onClick={() => execCommand('bold')} title="Жирный"><Bold size={18} /></button>
        <button onClick={() => execCommand('italic')} title="Курсив"><Italic size={18} /></button>
        <button onClick={() => execCommand('underline')} title="Подчёркнутый"><Underline size={18} /></button>
        <button onClick={() => execCommand('strikeThrough')} title="Зачёркнутый"><Strikethrough size={18} /></button>
        <div className="toolbar-divider" />
        <button onClick={() => execCommand('fontSize', '5')} title="Крупный текст"><Type size={20} /></button>
        <button onClick={() => execCommand('fontSize', '3')} title="Обычный текст"><Type size={14} /></button>
        <div className="toolbar-divider" />
        <button onClick={() => execCommand('insertUnorderedList')} title="Маркированный список"><List size={18} /></button>
        <button onClick={() => execCommand('insertOrderedList')} title="Нумерованный список"><ListOrdered size={18} /></button>
        <button onClick={insertTodoItem} title="Пункт с галочкой"><CheckCircle2 size={18} /></button>
        <div className="toolbar-divider" />
        <button onClick={applyQuote} title="Цитата"><Quote size={18} /></button>
        {note && (
          <div className="toolbar-actions desktop-only">
            <div className="toolbar-divider toolbar-spacer" />
            <button className={`pin-btn ${note.is_pinned ? 'active' : ''}`} onClick={() => onPin(note.id, note.is_pinned)} title={note.is_pinned ? 'Открепить' : 'Закрепить'}>
              <Pin size={18} />
            </button>
            <button className="delete-btn" onClick={() => onDelete(note.id)} title="Удалить">
              <Trash2 size={18} />
            </button>
          </div>
        )}
      </div>

      <div
        ref={editorRef}
        className="note-content-editor"
        contentEditable
        data-placeholder="Текст заметки..."
        onClick={handleEditorClick}
        onKeyDown={handleEditorKeyDown}
        onInput={triggerAutoSave}
        onMouseUp={handleSelectionChange}
        onTouchEnd={() => setTimeout(checkSelection, 300)}
      />

      {selectionMenu && (
        <div className="selection-menu" style={{ left: selectionMenu.x, top: selectionMenu.y, transform: 'translate(-50%, -100%)' }} onMouseDown={e => e.preventDefault()}>
          <button onClick={applyQuote} title="Цитата">
            <Quote size={16} />
            <span>Цитата</span>
          </button>
        </div>
      )}
    </div>
  )
}
