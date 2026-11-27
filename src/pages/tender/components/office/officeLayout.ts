// Планировка Тендерного отдела 2026 (PDF от заказчика): столы, стулья, стены. Только константы, без логики.
// Координаты — пиксели картинки плана: X вправо, Y вниз. 80 px = 1 м. И 2D-план, и 3D-сцена строятся отсюда.

export const PX_PER_M = 80
// Левый верхний угол внутреннего контура помещения (начало координат 3D: X_m = (x - ORIGIN.x) / PX_PER_M)
export const ORIGIN = { x: 150, y: 48 } as const
// Внутренний контур помещения
export const ROOM_RECT = { x0: 150, y0: 48, x1: 1026, y1: 1079 } as const
export const WALL_THICKNESS_PX = 15
// Рамка 2D-плана: внутренний контур плюс стены
export const PLAN_VIEW = {
  x: ROOM_RECT.x0 - WALL_THICKNESS_PX,
  y: ROOM_RECT.y0 - WALL_THICKNESS_PX,
  width: ROOM_RECT.x1 - ROOM_RECT.x0 + 2 * WALL_THICKNESS_PX,
  height: ROOM_RECT.y1 - ROOM_RECT.y0 + 2 * WALL_THICKNESS_PX
} as const

export interface IPxRect {
  x0: number
  y0: number
  x1: number
  y1: number
}

// tall — наружные северная и западная (полная высота); rail — наружные южная и восточная (бортик); low — стены кабинетов
export type TWallKind = 'tall' | 'rail' | 'low'

export interface IWall {
  rect: IPxRect
  kind: TWallKind
}

// Северная стена с окнами: в 3D строится отдельно (простенки, подоконники, стекло)
export const NORTH_WALL: IWall = { kind: 'tall', rect: { x0: 135, y0: 33, x1: 1041, y1: 48 } }

// Окна в северной стене (x0…x1 в px), простенок x 550…635
export const WINDOWS: readonly { x0: number; x1: number }[] = [
  { x0: 175, x1: 335 },
  { x0: 385, x1: 545 },
  { x0: 640, x1: 800 },
  { x0: 850, x1: 1005 }
]

// Колонна у свободного стола (на чертеже — квадрат со штриховкой)
export const COLUMNS: readonly IPxRect[] = [{ x0: 622, y0: 723, x1: 668, y1: 773 }]

// Тумбы: у северной кромки блока B|C по центру стыка столов (между стульями Артамонова и Некрасова) и слева от нижнего блока Зинина
export const TUMBAS: readonly IPxRect[] = [
  { x0: 518, y0: 109, x1: 558, y1: 151 },
  { x0: 700, y0: 438, x1: 745, y1: 535 }
]

export const WALLS: readonly IWall[] = [
  NORTH_WALL,
  { kind: 'tall', rect: { x0: 135, y0: 48, x1: 150, y1: 1094 } },
  { kind: 'rail', rect: { x0: 1026, y0: 48, x1: 1041, y1: 1094 } },
  // Южная стена — с проёмом входа x 510…658
  { kind: 'rail', rect: { x0: 150, y0: 1079, x1: 510, y1: 1094 } },
  { kind: 'rail', rect: { x0: 658, y0: 1079, x1: 1026, y1: 1094 } },
  // Кабинет слева внизу
  { kind: 'low', rect: { x0: 150, y0: 779.5, x1: 437.5, y1: 794.5 } },
  { kind: 'low', rect: { x0: 422.5, y0: 794.5, x1: 437.5, y1: 1000 } },
  // Кабинет справа внизу
  { kind: 'low', rect: { x0: 707, y0: 879.5, x1: 1026, y1: 894.5 } },
  { kind: 'low', rect: { x0: 707.5, y0: 894.5, x1: 722.5, y1: 1000 } },
  // Стена за местом Шанина (под столом) и справа от места Стефанеева
  { kind: 'low', rect: { x0: 910, y0: 752, x1: 1026, y1: 767 } },
  { kind: 'low', rect: { x0: 910, y0: 767, x1: 925, y1: 879.5 } }
]

// Проём входа в южной стене
export const ENTRANCE: IPxRect = { x0: 510, y0: 1079, x1: 658, y1: 1094 }

export interface IDoor {
  // Петля и единичное направление открытой створки (в плоскости плана)
  x: number
  y: number
  dx: number
  dy: number
  lengthPx: number
}

// Двери кабинетов открыты внутрь коридора (проёмы y 1000…1079)
export const DOORS: readonly IDoor[] = [
  { x: 430, y: 1000, dx: 0.966, dy: 0.259, lengthPx: 79 },
  { x: 715, y: 1000, dx: -0.966, dy: 0.259, lengthPx: 79 }
]

// Сторона стола, с которой стоит стул: N — человек севернее стола и смотрит на юг, S — на север, E — на запад, W — на восток
export type TChairSide = 'N' | 'S' | 'E' | 'W'

export interface IOfficeDesk {
  id: string
  rect: IPxRect
  chair: TChairSide
  // Номер места человека (IOfficeSeat.no); без номера — пустой стол
  seatNo?: number
}

const desk = (id: string, x0: number, y0: number, x1: number, y1: number, chair: TChairSide, seatNo?: number): IOfficeDesk => ({
  id,
  rect: { x0, y0, x1, y1 },
  chair,
  seatNo
})

// Стол — 128×54 px (1.6×0.675 м); блоки смежных столов стоят вплотную
export const OFFICE_DESKS: readonly IOfficeDesk[] = [
  desk('LUIS', 151, 151, 279, 205, 'N', 1),
  desk('KAZAKOV', 151, 205, 279, 258, 'S', 2),
  desk('ARTAMONOV', 410, 151, 538, 205, 'N', 3),
  desk('KHOLODOV', 410, 205, 538, 258, 'S', 4),
  desk('LEV', 538, 151, 666, 205, 'N', 5),
  desk('KUZMIN', 538, 205, 666, 258, 'S'),
  // Блок Зинина 2×2: Зинин — верхний левый, Коваленко — нижний правый
  desk('ZININ', 748, 151, 876, 205, 'N', 6),
  desk('D_TR', 876, 151, 1004, 205, 'N'),
  desk('D_BL', 748, 205, 876, 258, 'S'),
  desk('KOVALENKO', 876, 205, 1004, 258, 'S', 7),
  desk('IVANOV', 151, 433, 279, 487, 'N', 8),
  desk('STEPANOV', 151, 487, 279, 540, 'S', 9),
  desk('KUKLEV', 410, 433, 538, 487, 'N', 10),
  desk('ZHUK', 410, 487, 538, 540, 'S'),
  desk('GOLOTIN', 538, 433, 666, 487, 'N', 11),
  desk('SAVOSTENKO', 538, 487, 666, 540, 'S'),
  // Блок под ним 2×2, все столы свободны
  desk('H_TL', 748, 433, 876, 487, 'N'),
  desk('H_TR', 876, 433, 1004, 487, 'N'),
  desk('H_BL', 748, 487, 876, 540, 'S'),
  desk('H_BR', 876, 487, 1004, 540, 'S'),
  desk('UZUN', 217, 651, 271, 779, 'W'),
  desk('TOPCHIY', 271, 651, 325, 779, 'E', 12),
  desk('STEFANEEV', 623, 825, 751, 879, 'N', 14),
  desk('SHANIN', 857, 751.5, 910, 879.5, 'W'),
  desk('NATALYA', 898, 697.5, 1026, 751.5, 'N', 13),
  desk('CHEPIKOV', 151, 945, 279, 1000, 'S'),
  desk('ODINTSOV', 825, 895, 879, 1023, 'E', 15)
]

// Декор
export const WARDROBES: readonly IPxRect[] = [
  { x0: 208, y0: 838, x1: 262, y1: 945 },
  // Шкаф слева от свободного стола у кабинета Одинцова
  { x0: 576, y0: 764, x1: 618, y1: 866 }
]

export interface IOfficeSeat {
  // Номер места — порядок списка под видом; цвет рубашки и сдвиг фаз анимации
  no: number
  employeeId: number
  // Запасная подпись, если сотрудника нет в загруженном списке
  surname: string
}

// Люди по id из tender_employees, в порядке списка
export const OFFICE_SEATS: readonly IOfficeSeat[] = [
  { no: 1, employeeId: 194, surname: 'Луис' },
  { no: 2, employeeId: 188, surname: 'Казаков' },
  { no: 3, employeeId: 182, surname: 'Артамонов' },
  { no: 4, employeeId: 185, surname: 'Жук' },
  { no: 5, employeeId: 195, surname: 'Некрасов' },
  { no: 6, employeeId: 186, surname: 'Зинин' },
  { no: 7, employeeId: 189, surname: 'Коваленко' },
  { no: 8, employeeId: 199, surname: 'Сапожникова' },
  { no: 9, employeeId: 209, surname: 'Буслов' },
  { no: 10, employeeId: 192, surname: 'Куклев' },
  { no: 11, employeeId: 183, surname: 'Голотин' },
  { no: 12, employeeId: 202, surname: 'Топчий' },
  { no: 13, employeeId: 205, surname: 'Шанин' },
  { no: 14, employeeId: 201, surname: 'Стефанеев' },
  { no: 15, employeeId: 196, surname: 'Одинцов' }
]

export const SEAT_EMPLOYEE_IDS: readonly number[] = OFFICE_SEATS.map(seat => seat.employeeId)

// Размеры человечка на 2D-плане (OfficeSprite рисуется в 96×93)
export const SPRITE_WIDTH = 96
export const SPRITE_HEIGHT = 93
