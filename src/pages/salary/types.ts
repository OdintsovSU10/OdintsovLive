export interface Payment {
  id: string
  amount: number
  date: string
  note: string
}

export interface MonthStats {
  work: number
  worked: number
  vacation: number
}

export interface SalaryData {
  monthSalaries: { [key: string]: number }
  monthBonuses: { [key: string]: number }
  monthTransport: { [key: string]: number }
  monthWorkDaysNorm: { [key: string]: number }
  monthVacationRates: { [key: string]: number }
  monthPayments: { [key: string]: number }
  monthPaymentsList: { [key: string]: Payment[] }
  monthStats: { [key: string]: MonthStats }
}
