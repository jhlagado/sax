; ZAX lowered .asm trace
; range: $0100..$0109 (end exclusive)

; func main begin
main:
push BC                        ; 0100: C5
jp cc, __zax_epilogue_0        ; 0101: CA 00 00
jp __zax_epilogue_0            ; 0104: C3 00 00
__zax_epilogue_0:
pop BC                         ; 0107: C1
ret                            ; 0108: C9
; func main end

; symbols:
; label main = $0100
; label __zax_epilogue_0 = $0107
