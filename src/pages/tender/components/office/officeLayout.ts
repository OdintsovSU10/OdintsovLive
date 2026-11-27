// Места на плане офиса: сотрудник привязан по id из tender_employees. Только константы, без логики.

export interface IOfficeSeat {
  // Номер места — порядок списка под планом; на плане не показывается
  no: number
  employeeId: number
  // Запасная подпись, если сотрудника нет в загруженном списке
  surname: string
  // Левый верхний угол места на плане
  x: number
  y: number
}

export const PLAN_WIDTH = 1200
export const PLAN_HEIGHT = 760
export const PLAN_RADIUS = 24

export const SEAT_WIDTH = 110
export const SEAT_HEIGHT = 130
export const SPRITE_WIDTH = 96
export const SPRITE_HEIGHT = 93

export const OFFICE_SEATS: readonly IOfficeSeat[] = [
  { no: 1, employeeId: 194, surname: 'Луис', x: 40, y: 30 },
  { no: 2, employeeId: 182, surname: 'Артамонов', x: 210, y: 30 },
  { no: 3, employeeId: 188, surname: 'Казаков', x: 40, y: 170 },
  { no: 4, employeeId: 185, surname: 'Жук', x: 210, y: 170 },
  { no: 5, employeeId: 199, surname: 'Сапожникова', x: 40, y: 340 },
  { no: 6, employeeId: 192, surname: 'Куклев', x: 210, y: 340 },
  { no: 7, employeeId: 209, surname: 'Буслов', x: 40, y: 480 },
  { no: 8, employeeId: 202, surname: 'Топчий', x: 40, y: 620 },
  { no: 9, employeeId: 195, surname: 'Некрасов', x: 390, y: 30 },
  { no: 10, employeeId: 186, surname: 'Зинин', x: 620, y: 30 },
  { no: 11, employeeId: 189, surname: 'Коваленко', x: 830, y: 190 },
  { no: 12, employeeId: 205, surname: 'Шанин', x: 1040, y: 450 },
  { no: 13, employeeId: 183, surname: 'Голотин', x: 330, y: 340 }
]

export interface IWallLine {
  x1: number
  y1: number
  x2: number
  y2: number
}

// Перегородка и комната в правом нижнем углу (без подписи)
export const WALL_LINES: readonly IWallLine[] = [
  { x1: 620, y1: 170, x2: 1010, y2: 170 },
  { x1: 900, y1: 590, x2: 1200, y2: 590 },
  { x1: 900, y1: 590, x2: 910, y2: 760 }
]

export const SEAT_EMPLOYEE_IDS: readonly number[] = OFFICE_SEATS.map(seat => seat.employeeId)
