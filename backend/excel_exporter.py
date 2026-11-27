"""
Excel Export Engine for Attendance & Biometric Movement Tracker
Generates professional, styled .xlsx workbooks for:
1. Daily Attendance & Shift Movement Ledger
2. Shift Working Hours - Absence & Break Audit Log
"""

import io
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter


def create_thin_border(border_color='CBD5E1'):
    s = Side(style='thin', color=border_color)
    return Border(left=s, right=s, top=s, bottom=s)


def export_attendance_ledger_excel(records, summary, date_str, org_id="bellwether"):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = f"Attendance_{date_str}"
    ws.views.sheetView[0].showGridLines = True

    # 1. Main Header Title
    ws.merge_cells("A1:O1")
    title_cell = ws["A1"]
    title_cell.value = f"{str(org_id).upper()} — Daily Attendance & Shift Movement Ledger ({date_str})"
    title_cell.font = Font(name="Segoe UI", size=14, bold=True, color="FFFFFF")
    title_cell.fill = PatternFill(start_color="0F766E", end_color="0F766E", fill_type="solid")
    title_cell.alignment = Alignment(horizontal="center", vertical="center")
    ws.row_dimensions[1].height = 36

    # 2. Executive KPI Summary Bar
    ws.merge_cells("A2:O2")
    kpi_cell = ws["A2"]
    kpi_cell.value = (
        f"Staff Enrolled: {summary.get('total_staff', len(records))}  |  "
        f"On Duty: {summary.get('on_duty_count', 0)}  |  "
        f"Completed: {summary.get('checked_out_count', 0)}  |  "
        f"Absent: {summary.get('absent_count', 0)}  |  "
        f"Early Arrivals: {summary.get('early_checkin_count', 0)}  |  "
        f"Late Arrivals: {summary.get('late_arrivals_count', 0)}  |  "
        f"Late Night Exits: {summary.get('late_night_exit_count', 0)}  |  "
        f"Avg Working: {summary.get('avg_working_str', '0h 00m')}  |  "
        f"Avg Break: {summary.get('avg_break_str', '0h 00m')}  |  "
        f"Productivity: {summary.get('avg_productivity_pct', 0)}%"
    )
    kpi_cell.font = Font(name="Segoe UI", size=9, bold=True, color="0F766E")
    kpi_cell.fill = PatternFill(start_color="CCFBF1", end_color="CCFBF1", fill_type="solid")
    kpi_cell.alignment = Alignment(horizontal="center", vertical="center")
    ws.row_dimensions[2].height = 24

    ws.append([]) # Row 3 spacer
    ws.row_dimensions[3].height = 8

    # 3. Table Column Headers
    headers = [
        "Employee ID",
        "Employee Name",
        "Department",
        "Assigned Shift",
        "Status",
        "First In (Entry)",
        "Arrival Audit",
        "Final Out (Exit)",
        "Late Night Exit (>12 AM)",
        "Working Hours",
        "Break Time",
        "Shift Span",
        "Productivity %",
        "Passages",
        "Entry Gate Checkpoint"
    ]
    ws.append(headers)
    ws.row_dimensions[4].height = 28

    header_fill = PatternFill(start_color="134E4A", end_color="134E4A", fill_type="solid")
    header_font = Font(name="Segoe UI", size=10, bold=True, color="FFFFFF")

    for col_idx in range(1, len(headers) + 1):
        cell = ws.cell(row=4, column=col_idx)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)

    border = create_thin_border("E2E8F0")

    # 4. Data Rows
    for r in records:
        status = r.get('status', 'Absent')
        early_flag = r.get('is_early_checkin', False)
        late_night = r.get('is_late_night_exit', False)

        row = [
            r.get('employee_id') or r.get('emp_code', '—'),
            r.get('name', '—'),
            r.get('department', 'General Staff'),
            r.get('shift_timing_display') or f"{r.get('shift_start', '09:00')} - {r.get('shift_end', '18:00')}",
            status,
            r.get('check_in_display') or '—',
            r.get('arrival_audit') or ('Early' if early_flag else ('On Time' if status != 'Absent' else '—')),
            r.get('check_out_display') or '—',
            r.get('late_night_exit_str') or ('Yes' if late_night else 'No'),
            r.get('working_str', '0h 00m'),
            r.get('break_str', '0h 00m'),
            r.get('shift_span_str', '0h 00m'),
            f"{r.get('productivity_pct', 0)}%",
            int(r.get('in_count', 0) + r.get('out_count', 0)),
            r.get('check_in_camera_name', '—')
        ]
        ws.append(row)
        curr_row = ws.max_row
        ws.row_dimensions[curr_row].height = 22

        # Status & Alert Highlighting
        for col_idx in range(1, len(row) + 1):
            cell = ws.cell(row=curr_row, column=col_idx)
            cell.border = border
            cell.font = Font(name="Segoe UI", size=9)
            cell.alignment = Alignment(
                horizontal="left" if col_idx in (2, 3) else "center",
                vertical="center"
            )

            # Highlight status
            if col_idx == 5: # Status
                if status == 'On Duty':
                    cell.font = Font(name="Segoe UI", size=9, bold=True, color="15803D")
                    cell.fill = PatternFill(start_color="DCFCE7", end_color="DCFCE7", fill_type="solid")
                elif status == 'Checked Out':
                    cell.font = Font(name="Segoe UI", size=9, bold=True, color="C2410C")
                    cell.fill = PatternFill(start_color="FFEDD5", end_color="FFEDD5", fill_type="solid")
                else:
                    cell.font = Font(name="Segoe UI", size=9, color="64748B")

            # Highlight Early Arrival
            if col_idx == 7 and 'Early' in str(cell.value):
                cell.font = Font(name="Segoe UI", size=9, bold=True, color="B45309")
                cell.fill = PatternFill(start_color="FEF3C7", end_color="FEF3C7", fill_type="solid")

            # Highlight Late Night Exit
            if col_idx == 9 and ('Yes' in str(cell.value) or 'Late Night' in str(cell.value)):
                cell.font = Font(name="Segoe UI", size=9, bold=True, color="991B1B")
                cell.fill = PatternFill(start_color="FEE2E2", end_color="FEE2E2", fill_type="solid")

    # 5. Dynamic Auto Column Widths
    for col in ws.columns:
        max_len = 0
        for cell in col:
            if cell.row in (1, 2, 3):
                continue
            val_str = str(cell.value or '')
            if len(val_str) > max_len:
                max_len = len(val_str)
        col_letter = get_column_letter(col[0].column)
        ws.column_dimensions[col_letter].width = max(max_len + 4, 12)

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf.getvalue()


def export_absences_audit_excel(absences, stats, date_str, org_id="bellwether"):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = f"Absences_{date_str}"
    ws.views.sheetView[0].showGridLines = True

    # 1. Main Header Title
    ws.merge_cells("A1:K1")
    title_cell = ws["A1"]
    title_cell.value = f"{str(org_id).upper()} — Shift Working Hours Absence & Break Audit Log ({date_str})"
    title_cell.font = Font(name="Segoe UI", size=14, bold=True, color="FFFFFF")
    title_cell.fill = PatternFill(start_color="EA580C", end_color="EA580C", fill_type="solid")
    title_cell.alignment = Alignment(horizontal="center", vertical="center")
    ws.row_dimensions[1].height = 36

    # 2. Executive KPI Summary Bar
    ws.merge_cells("A2:K2")
    kpi_cell = ws["A2"]
    total_abs = stats.get('total', len(absences))
    kpi_cell.value = (
        f"Total Absence Events: {total_abs}  |  "
        f"Short Breaks (<60m): {stats.get('short_count', 0)}  |  "
        f"Policy Overstays (≥60m): {stats.get('overstay_count', 0)}  |  "
        f"Currently Outside: {stats.get('away_count', 0)}  |  "
        f"Returned to Duty: {stats.get('returned_count', 0)}  |  "
        f"Break Policy: Max 60m / Break"
    )
    kpi_cell.font = Font(name="Segoe UI", size=9, bold=True, color="C2410C")
    kpi_cell.fill = PatternFill(start_color="FFEDD5", end_color="FFEDD5", fill_type="solid")
    kpi_cell.alignment = Alignment(horizontal="center", vertical="center")
    ws.row_dimensions[2].height = 24

    ws.append([]) # Row 3 spacer
    ws.row_dimensions[3].height = 8

    # 3. Table Column Headers
    headers = [
        "Shift Date",
        "Employee ID",
        "Employee Name",
        "Department",
        "Departed Time (Exit Gate)",
        "Exit Checkpoint",
        "Returned Time (Entry Gate)",
        "Entry Checkpoint",
        "Away Duration",
        "Policy Status",
        "Overstay Exceeded"
    ]
    ws.append(headers)
    ws.row_dimensions[4].height = 28

    header_fill = PatternFill(start_color="9A3412", end_color="9A3412", fill_type="solid")
    header_font = Font(name="Segoe UI", size=10, bold=True, color="FFFFFF")

    for col_idx in range(1, len(headers) + 1):
        cell = ws.cell(row=4, column=col_idx)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)

    border = create_thin_border("E2E8F0")

    # 4. Data Rows
    for b in absences:
        is_ext = b.get('is_extended', False)
        status = b.get('status', 'Returned')
        overstay = b.get('overstay_str', '0m')

        row = [
            b.get('date') or date_str,
            b.get('employee_id', '—'),
            b.get('name', '—'),
            b.get('department', 'General Staff'),
            b.get('exit_display') or b.get('exit_time', '—'),
            b.get('exit_camera_name', 'Exit Gate'),
            b.get('entry_display') or (b.get('entry_time') if b.get('entry_time') else 'Still Outside'),
            b.get('entry_camera_name') or ('—' if status == 'Currently Away' else 'Entry Gate'),
            b.get('duration_str', '0m'),
            'Policy Breach (≥60m)' if is_ext else ('Currently Away' if status == 'Currently Away' else 'Normal (<60m)'),
            overstay if is_ext else 'Within Policy'
        ]
        ws.append(row)
        curr_row = ws.max_row
        ws.row_dimensions[curr_row].height = 22

        for col_idx in range(1, len(row) + 1):
            cell = ws.cell(row=curr_row, column=col_idx)
            cell.border = border
            cell.font = Font(name="Segoe UI", size=9)
            cell.alignment = Alignment(
                horizontal="left" if col_idx in (3, 4) else "center",
                vertical="center"
            )

            # Highlight Breaches
            if col_idx == 10 and is_ext:
                cell.font = Font(name="Segoe UI", size=9, bold=True, color="991B1B")
                cell.fill = PatternFill(start_color="FEE2E2", end_color="FEE2E2", fill_type="solid")
            elif col_idx == 10 and status == 'Currently Away':
                cell.font = Font(name="Segoe UI", size=9, bold=True, color="EA580C")
                cell.fill = PatternFill(start_color="FFEDD5", end_color="FFEDD5", fill_type="solid")

    # 5. Dynamic Auto Column Widths
    for col in ws.columns:
        max_len = 0
        for cell in col:
            if cell.row in (1, 2, 3):
                continue
            val_str = str(cell.value or '')
            if len(val_str) > max_len:
                max_len = len(val_str)
        col_letter = get_column_letter(col[0].column)
        ws.column_dimensions[col_letter].width = max(max_len + 4, 12)

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf.getvalue()

