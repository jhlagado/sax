; ZAX lowered .asm trace
; range: $0100..$014F (end exclusive)

; func touch_locals begin
touch_locals:
push IX                        ; 0100: DD E5
ld IX, $0000                   ; 0102: DD 21 00 00
add IX, SP                     ; 0106: DD 39
push HL                        ; 0108: E5
ld HL, $0007                   ; 0109: 21 07 00
ex (SP), HL                    ; 010C: E3
push HL                        ; 010D: E5
ld HL, $1111                   ; 010E: 21 11 11
ex (SP), HL                    ; 0111: E3
push AF                        ; 0112: F5
push BC                        ; 0113: C5
push DE                        ; 0114: D5
push HL                        ; 0115: E5
ld A, (IX-$02)                 ; 0116: DD 7E FE
dec A                          ; 0119: 3D
ld (IX-$02), A                 ; 011A: DD 77 FE
ex DE, HL                      ; 011D: EB
ld E, (IX - $0004)             ; 011E: DD 5E FC
ld D, (IX - $0003)             ; 0121: DD 56 FD
ex DE, HL                      ; 0124: EB
inc HL                         ; 0125: 23
ex DE, HL                      ; 0126: EB
ld (IX - $0004), E             ; 0127: DD 73 FC
ld (IX - $0003), D             ; 012A: DD 72 FD
ex DE, HL                      ; 012D: EB
__zax_epilogue_0:
pop HL                         ; 012E: E1
pop DE                         ; 012F: D1
pop BC                         ; 0130: C1
pop AF                         ; 0131: F1
ld SP, IX                      ; 0132: DD F9
pop IX                         ; 0134: DD E1
ret                            ; 0136: C9
; func main begin
; func touch_locals end
main:
push IX                        ; 0137: DD E5
ld IX, $0000                   ; 0139: DD 21 00 00
add IX, SP                     ; 013D: DD 39
push AF                        ; 013F: F5
push BC                        ; 0140: C5
push DE                        ; 0141: D5
push HL                        ; 0142: E5
call touch_locals              ; 0143: CD 00 00
__zax_epilogue_1:
pop HL                         ; 0146: E1
pop DE                         ; 0147: D1
pop BC                         ; 0148: C1
pop AF                         ; 0149: F1
ld SP, IX                      ; 014A: DD F9
pop IX                         ; 014C: DD E1
ret                            ; 014E: C9
; func main end

; symbols:
; label touch_locals = $0100
; label __zax_epilogue_0 = $012E
; label main = $0137
; label __zax_epilogue_1 = $0146
