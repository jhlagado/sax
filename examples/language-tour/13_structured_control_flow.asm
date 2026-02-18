; ZAX lowered .asm trace
; range: $0100..$0159 (end exclusive)

; func run_once begin
run_once:
push AF                        ; 0100: F5
push BC                        ; 0101: C5
push DE                        ; 0102: D5
ld A, (mode_value)             ; 0103: 3A 00 00
or A                           ; 0106: B7
jp cc, __zax_if_else_1         ; 0107: C2 00 00
ld A, $0001                    ; 010A: 3E 01
jp __zax_if_end_2              ; 010C: C3 00 00
__zax_if_else_1:
ld A, $0002                    ; 010F: 3E 02
__zax_if_end_2:
__zax_while_cond_3:
jp cc, __zax_while_end_4       ; 0111: CA 00 00
dec A                          ; 0114: 3D
jp __zax_while_cond_3          ; 0115: C3 00 00
__zax_while_end_4:
ld A, $0001                    ; 0118: 3E 01
__zax_repeat_body_5:
dec A                          ; 011A: 3D
jp cc, __zax_repeat_body_5     ; 011B: C2 00 00
ld A, (mode_value)             ; 011E: 3A 00 00
jp __zax_select_dispatch_6     ; 0121: C3 00 00
__zax_case_8:
ld A, $000A                    ; 0124: 3E 0A
jp __zax_select_end_7          ; 0126: C3 00 00
__zax_case_9:
ld A, $0014                    ; 0129: 3E 14
jp __zax_select_end_7          ; 012B: C3 00 00
__zax_select_else_10:
ld A, $001E                    ; 012E: 3E 1E
jp __zax_select_end_7          ; 0130: C3 00 00
__zax_select_dispatch_6:
push HL                        ; 0133: E5
ld H, $0000                    ; 0134: 26 00
ld L, A                        ; 0136: 6F
ld a, l                        ; 0137: 7D
cp imm8                        ; 0138: FE 00
jp cc, __zax_select_next_11    ; 013A: C2 00 00
pop HL                         ; 013D: E1
jp __zax_case_8                ; 013E: C3 00 00
__zax_select_next_11:
cp imm8                        ; 0141: FE 01
jp cc, __zax_select_next_12    ; 0143: C2 00 00
pop HL                         ; 0146: E1
jp __zax_case_9                ; 0147: C3 00 00
__zax_select_next_12:
pop HL                         ; 014A: E1
jp __zax_select_else_10        ; 014B: C3 00 00
__zax_select_end_7:
ld (mode_value), A             ; 014E: 32 00 00
pop DE                         ; 0151: D1
pop BC                         ; 0152: C1
pop AF                         ; 0153: F1
ret                            ; 0154: C9
; func main begin
; func run_once end
main:
call run_once                  ; 0155: CD 00 00
ret                            ; 0158: C9
; func main end

; symbols:
; label run_once = $0100
; label __zax_if_else_1 = $010F
; label __zax_if_end_2 = $0111
; label __zax_while_cond_3 = $0111
; label __zax_while_end_4 = $0118
; label __zax_repeat_body_5 = $011A
; label __zax_case_8 = $0124
; label __zax_case_9 = $0129
; label __zax_select_else_10 = $012E
; label __zax_select_dispatch_6 = $0133
; label __zax_select_next_11 = $0141
; label __zax_select_next_12 = $014A
; label __zax_select_end_7 = $014E
; label main = $0155
; var mode_value = $015A
