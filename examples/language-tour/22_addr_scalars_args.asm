; ZAX lowered .asm trace
; range: $0100..$0146 (end exclusive)

; func add_store_args begin
add_store_args:
push IX                        ; 0100: DD E5
ld IX, $0000                   ; 0102: DD 21 00 00
add IX, SP                     ; 0106: DD 39
push AF                        ; 0108: F5
push BC                        ; 0109: C5
push DE                        ; 010A: D5
ex DE, HL                      ; 010B: EB
ld E, (IX + $0004)             ; 010C: DD 5E 04
ld D, (IX + $0005)             ; 010F: DD 56 05
ex DE, HL                      ; 0112: EB
ld E, (IX + $0006)             ; 0113: DD 5E 06
ld D, (IX + $0007)             ; 0116: DD 56 07
add HL, DE                     ; 0119: 19
__zax_epilogue_0:
pop DE                         ; 011A: D1
pop BC                         ; 011B: C1
pop AF                         ; 011C: F1
ld SP, IX                      ; 011D: DD F9
pop IX                         ; 011F: DD E1
ret                            ; 0121: C9
; func add_store_args end
; func main begin
main:
push IX                        ; 0122: DD E5
ld IX, $0000                   ; 0124: DD 21 00 00
add IX, SP                     ; 0128: DD 39
push AF                        ; 012A: F5
push BC                        ; 012B: C5
push DE                        ; 012C: D5
push HL                        ; 012D: E5
ld HL, $0002                   ; 012E: 21 02 00
push HL                        ; 0131: E5
ld HL, $0001                   ; 0132: 21 01 00
push HL                        ; 0135: E5
call add_store_args            ; 0136: CD 00 00
inc SP                         ; 0139: 33
inc SP                         ; 013A: 33
inc SP                         ; 013B: 33
inc SP                         ; 013C: 33
__zax_epilogue_1:
pop HL                         ; 013D: E1
pop DE                         ; 013E: D1
pop BC                         ; 013F: C1
pop AF                         ; 0140: F1
ld SP, IX                      ; 0141: DD F9
pop IX                         ; 0143: DD E1
ret                            ; 0145: C9
; func main end

; symbols:
; label add_store_args = $0100
; label __zax_epilogue_0 = $011A
; label main = $0122
; label __zax_epilogue_1 = $013D
