; ZAX lowered .asm trace
; range: $0100..$0146 (end exclusive)

; func touch_arrays_const begin
touch_arrays_const:
push IX                        ; 0100: DD E5
ld IX, $0000                   ; 0102: DD 21 00 00
add IX, SP                     ; 0106: DD 39
push AF                        ; 0108: F5
push BC                        ; 0109: C5
push DE                        ; 010A: D5
ld A, (arr_b + 2)              ; 010B: 3A 00 00
ld (arr_b + 1), A              ; 010E: 32 00 00
ld HL, (arr_w)                 ; 0111: 2A 00 00
ld (arr_w + 4), HL             ; 0114: 22 00 00
ld HL, (arr_w + 2)             ; 0117: 2A 00 00
__zax_epilogue_0:
pop DE                         ; 011A: D1
pop BC                         ; 011B: C1
pop AF                         ; 011C: F1
ld SP, IX                      ; 011D: DD F9
pop IX                         ; 011F: DD E1
ret                            ; 0121: C9
; func main begin
; func touch_arrays_const end
main:
push IX                        ; 0122: DD E5
ld IX, $0000                   ; 0124: DD 21 00 00
add IX, SP                     ; 0128: DD 39
push AF                        ; 012A: F5
push BC                        ; 012B: C5
push DE                        ; 012C: D5
push HL                        ; 012D: E5
call touch_arrays_const        ; 012E: CD 00 00
__zax_epilogue_1:
pop HL                         ; 0131: E1
pop DE                         ; 0132: D1
pop BC                         ; 0133: C1
pop AF                         ; 0134: F1
ld SP, IX                      ; 0135: DD F9
pop IX                         ; 0137: DD E1
ret                            ; 0139: C9
; func main end

; symbols:
; label touch_arrays_const = $0100
; label __zax_epilogue_0 = $011A
; label main = $0122
; label __zax_epilogue_1 = $0131
; data arr_b = $013A
; data arr_w = $013E
