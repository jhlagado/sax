; ZAX lowered .asm trace
; range: $0100..$010D (end exclusive)

; func main begin
main:
jp cc, __zax_if_else_1         ; 0100: CA 00 00
nop                            ; 0103: 00
__zax_if_else_1:
jp cc, __zax_if_else_3         ; 0104: C2 00 00
nop                            ; 0107: 00
__zax_if_else_3:
jp cc, __zax_if_else_5         ; 0108: D2 00 00
nop                            ; 010B: 00
__zax_if_else_5:
ret                            ; 010C: C9
; func main end

; symbols:
; label main = $0100
; label __zax_if_else_1 = $0104
; label __zax_if_else_3 = $0108
; label __zax_if_else_5 = $010C
