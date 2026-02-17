; ZAX lowered .asm trace
; range: $0100..$0163 (end exclusive)

; func run_once begin
run_once:
ld A, (mode_value)             ; 0100: 3A 00 00
or A                           ; 0103: B7
jp cc, __zax_if_else_1         ; 0104: C2 00 00
ld A, $0001                    ; 0107: 3E 01
jp __zax_if_end_2              ; 0109: C3 00 00
__zax_if_else_1:
ld A, $0002                    ; 010C: 3E 02
__zax_if_end_2:
__zax_while_cond_3:
jp cc, __zax_while_end_4       ; 010E: CA 00 00
dec A                          ; 0111: 3D
jp __zax_while_cond_3          ; 0112: C3 00 00
__zax_while_end_4:
ld A, $0001                    ; 0115: 3E 01
__zax_repeat_body_5:
dec A                          ; 0117: 3D
jp cc, __zax_repeat_body_5     ; 0118: C2 00 00
ld A, (mode_value)             ; 011B: 3A 00 00
jp __zax_select_dispatch_6     ; 011E: C3 00 00
__zax_case_8:
ld A, $000A                    ; 0121: 3E 0A
jp __zax_select_end_7          ; 0123: C3 00 00
__zax_case_9:
ld A, $0014                    ; 0126: 3E 14
jp __zax_select_end_7          ; 0128: C3 00 00
__zax_select_else_10:
ld A, $001E                    ; 012B: 3E 1E
jp __zax_select_end_7          ; 012D: C3 00 00
__zax_select_dispatch_6:
push HL                        ; 0130: E5
ld H, $0000                    ; 0131: 26 00
ld L, A                        ; 0133: 6F
ld a, l                        ; 0134: 7D
cp imm8                        ; 0135: FE 00
jp cc, __zax_select_next_11    ; 0137: C2 00 00
pop HL                         ; 013A: E1
jp __zax_case_8                ; 013B: C3 00 00
__zax_select_next_11:
cp imm8                        ; 013E: FE 01
jp cc, __zax_select_next_12    ; 0140: C2 00 00
pop HL                         ; 0143: E1
jp __zax_case_9                ; 0144: C3 00 00
__zax_select_next_12:
pop HL                         ; 0147: E1
jp __zax_select_else_10        ; 0148: C3 00 00
__zax_select_end_7:
ld (mode_value), A             ; 014B: 32 00 00
ret                            ; 014E: C9
; func main begin
; func run_once end
main:
push AF                        ; 014F: F5
push BC                        ; 0150: C5
push DE                        ; 0151: D5
push IX                        ; 0152: DD E5
push IY                        ; 0154: FD E5
push HL                        ; 0156: E5
call run_once                  ; 0157: CD 00 00
pop HL                         ; 015A: E1
pop IY                         ; 015B: FD E1
pop IX                         ; 015D: DD E1
pop DE                         ; 015F: D1
pop BC                         ; 0160: C1
pop AF                         ; 0161: F1
ret                            ; 0162: C9
; func main end

; symbols:
; label run_once = $0100
; label __zax_if_else_1 = $010C
; label __zax_if_end_2 = $010E
; label __zax_while_cond_3 = $010E
; label __zax_while_end_4 = $0115
; label __zax_repeat_body_5 = $0117
; label __zax_case_8 = $0121
; label __zax_case_9 = $0126
; label __zax_select_else_10 = $012B
; label __zax_select_dispatch_6 = $0130
; label __zax_select_next_11 = $013E
; label __zax_select_next_12 = $0147
; label __zax_select_end_7 = $014B
; label main = $014F
; var mode_value = $0164
