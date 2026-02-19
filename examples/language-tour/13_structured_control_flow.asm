; ZAX lowered .asm trace
; range: $0100..$017D (end exclusive)

; func run_once begin
run_once:
push IX                        ; 0100: DD E5
ld IX, $0000                   ; 0102: DD 21 00 00
add IX, SP                     ; 0106: DD 39
push HL                        ; 0108: E5
push AF                        ; 0109: F5
push BC                        ; 010A: C5
push DE                        ; 010B: D5
push HL                        ; 010C: E5
ld A, (mode_value)             ; 010D: 3A 00 00
or A                           ; 0110: B7
jp nz, __zax_if_else_1         ; 0111: C2 00 00
ld A, $0001                    ; 0114: 3E 01
jp __zax_if_end_2              ; 0116: C3 00 00
__zax_if_else_1:
ld A, $0002                    ; 0119: 3E 02
__zax_if_end_2:
__zax_while_cond_3:
jp z, __zax_while_end_4        ; 011B: CA 00 00
dec A                          ; 011E: 3D
jp __zax_while_cond_3          ; 011F: C3 00 00
__zax_while_end_4:
ld A, $0001                    ; 0122: 3E 01
__zax_repeat_body_5:
dec A                          ; 0124: 3D
jp nz, __zax_repeat_body_5     ; 0125: C2 00 00
ld A, (mode_value)             ; 0128: 3A 00 00
jp __zax_select_dispatch_6     ; 012B: C3 00 00
__zax_case_8:
ld A, $000A                    ; 012E: 3E 0A
jp __zax_select_end_7          ; 0130: C3 00 00
__zax_case_9:
ld A, $0014                    ; 0133: 3E 14
jp __zax_select_end_7          ; 0135: C3 00 00
__zax_select_else_10:
ld A, $001E                    ; 0138: 3E 1E
jp __zax_select_end_7          ; 013A: C3 00 00
__zax_select_dispatch_6:
push HL                        ; 013D: E5
ld H, $0000                    ; 013E: 26 00
ld L, A                        ; 0140: 6F
ld a, l                        ; 0141: 7D
cp imm8                        ; 0142: FE 00
jp nz, __zax_select_next_11    ; 0144: C2 00 00
pop HL                         ; 0147: E1
jp __zax_case_8                ; 0148: C3 00 00
__zax_select_next_11:
cp imm8                        ; 014B: FE 01
jp nz, __zax_select_next_12    ; 014D: C2 00 00
pop HL                         ; 0150: E1
jp __zax_case_9                ; 0151: C3 00 00
__zax_select_next_12:
pop HL                         ; 0154: E1
jp __zax_select_else_10        ; 0155: C3 00 00
__zax_select_end_7:
ld (mode_value), A             ; 0158: 32 00 00
__zax_epilogue_0:
pop HL                         ; 015B: E1
pop DE                         ; 015C: D1
pop BC                         ; 015D: C1
pop AF                         ; 015E: F1
ld SP, IX                      ; 015F: DD F9
pop IX                         ; 0161: DD E1
ret                            ; 0163: C9
; func main begin
; func run_once end
main:
push IX                        ; 0164: DD E5
ld IX, $0000                   ; 0166: DD 21 00 00
add IX, SP                     ; 016A: DD 39
push HL                        ; 016C: E5
push AF                        ; 016D: F5
push BC                        ; 016E: C5
push DE                        ; 016F: D5
push HL                        ; 0170: E5
call run_once                  ; 0171: CD 00 00
__zax_epilogue_13:
pop HL                         ; 0174: E1
pop DE                         ; 0175: D1
pop BC                         ; 0176: C1
pop AF                         ; 0177: F1
ld SP, IX                      ; 0178: DD F9
pop IX                         ; 017A: DD E1
ret                            ; 017C: C9
; func main end

; symbols:
; label run_once = $0100
; label __zax_if_else_1 = $0119
; label __zax_if_end_2 = $011B
; label __zax_while_cond_3 = $011B
; label __zax_while_end_4 = $0122
; label __zax_repeat_body_5 = $0124
; label __zax_case_8 = $012E
; label __zax_case_9 = $0133
; label __zax_select_else_10 = $0138
; label __zax_select_dispatch_6 = $013D
; label __zax_select_next_11 = $014B
; label __zax_select_next_12 = $0154
; label __zax_select_end_7 = $0158
; label __zax_epilogue_0 = $015B
; label main = $0164
; label __zax_epilogue_13 = $0174
; var mode_value = $017E
