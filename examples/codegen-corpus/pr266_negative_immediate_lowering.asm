; ZAX lowered .asm trace
; range: $0100..$0117 (end exclusive)

; func main begin
main:
push BC                        ; 0100: C5
push BC                        ; 0101: C5
ld HL, $0000                   ; 0102: 21 00 00
add HL, SP                     ; 0105: 39
ld (HL), $FFFF                 ; 0106: 36 FF
ld HL, $0002                   ; 0108: 21 02 00
add HL, SP                     ; 010B: 39
ld (HL), $00FE                 ; 010C: 36 FE
inc HL                         ; 010E: 23
ld (HL), $00FF                 ; 010F: 36 FF
jp __zax_epilogue_0            ; 0111: C3 00 00
__zax_epilogue_0:
pop BC                         ; 0114: C1
pop BC                         ; 0115: C1
ret                            ; 0116: C9
; func main end

; symbols:
; label main = $0100
; label __zax_epilogue_0 = $0114
