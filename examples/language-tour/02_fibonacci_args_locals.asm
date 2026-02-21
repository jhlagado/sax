; ZAX lowered .asm trace
; range: $0100..$01B9 (end exclusive)

; func fib begin
fib:
push IX                        ; 0100: DD E5
ld IX, $0000                   ; 0102: DD 21 00 00
add IX, SP                     ; 0106: DD 39
ld HL, $0000                   ; 0108: 21 00 00
push HL                        ; 010B: E5
ld HL, $0001                   ; 010C: 21 01 00
push HL                        ; 010F: E5
ld HL, $0000                   ; 0110: 21 00 00
push HL                        ; 0113: E5
ld HL, $0000                   ; 0114: 21 00 00
push HL                        ; 0117: E5
push AF                        ; 0118: F5
push BC                        ; 0119: C5
push DE                        ; 011A: D5
__zax_while_cond_1:
jp z, __zax_while_end_2        ; 011B: CA 00 00
ex DE, HL                      ; 011E: EB
ld E, (IX - $0006)             ; 011F: DD 5E FA
ld D, (IX - $0005)             ; 0122: DD 56 FB
ex DE, HL                      ; 0125: EB
ld E, (IX + $0004)             ; 0126: DD 5E 04
ld D, (IX + $0005)             ; 0129: DD 56 05
xor A                          ; 012C: AF
sbc HL, DE                     ; 012D: ED 52
jp nz, __zax_if_else_3         ; 012F: C2 00 00
ex DE, HL                      ; 0132: EB
ld E, (IX - $0002)             ; 0133: DD 5E FE
ld D, (IX - $0001)             ; 0136: DD 56 FF
ex DE, HL                      ; 0139: EB
jp __zax_epilogue_0            ; 013A: C3 00 00
__zax_if_else_3:
ex DE, HL                      ; 013D: EB
ld E, (IX - $0002)             ; 013E: DD 5E FE
ld D, (IX - $0001)             ; 0141: DD 56 FF
ex DE, HL                      ; 0144: EB
ld E, (IX - $0004)             ; 0145: DD 5E FC
ld D, (IX - $0003)             ; 0148: DD 56 FD
add HL, DE                     ; 014B: 19
ex DE, HL                      ; 014C: EB
ld (IX - $0008), E             ; 014D: DD 73 F8
ld (IX - $0007), D             ; 0150: DD 72 F9
ex DE, HL                      ; 0153: EB
ex DE, HL                      ; 0154: EB
ld E, (IX - $0004)             ; 0155: DD 5E FC
ld D, (IX - $0003)             ; 0158: DD 56 FD
ex DE, HL                      ; 015B: EB
ex DE, HL                      ; 015C: EB
ld (IX - $0002), E             ; 015D: DD 73 FE
ld (IX - $0001), D             ; 0160: DD 72 FF
ex DE, HL                      ; 0163: EB
ex DE, HL                      ; 0164: EB
ld E, (IX - $0008)             ; 0165: DD 5E F8
ld D, (IX - $0007)             ; 0168: DD 56 F9
ex DE, HL                      ; 016B: EB
ex DE, HL                      ; 016C: EB
ld (IX - $0004), E             ; 016D: DD 73 FC
ld (IX - $0003), D             ; 0170: DD 72 FD
ex DE, HL                      ; 0173: EB
ex DE, HL                      ; 0174: EB
ld E, (IX - $0006)             ; 0175: DD 5E FA
ld D, (IX - $0005)             ; 0178: DD 56 FB
ex DE, HL                      ; 017B: EB
inc HL                         ; 017C: 23
ex DE, HL                      ; 017D: EB
ld (IX - $0006), E             ; 017E: DD 73 FA
ld (IX - $0005), D             ; 0181: DD 72 FB
ex DE, HL                      ; 0184: EB
ld A, $0001                    ; 0185: 3E 01
or A                           ; 0187: B7
jp __zax_while_cond_1          ; 0188: C3 00 00
__zax_while_end_2:
ex DE, HL                      ; 018B: EB
ld E, (IX - $0002)             ; 018C: DD 5E FE
ld D, (IX - $0001)             ; 018F: DD 56 FF
ex DE, HL                      ; 0192: EB
__zax_epilogue_0:
pop DE                         ; 0193: D1
pop BC                         ; 0194: C1
pop AF                         ; 0195: F1
ld SP, IX                      ; 0196: DD F9
pop IX                         ; 0198: DD E1
ret                            ; 019A: C9
; func fib end
; func main begin
main:
push IX                        ; 019B: DD E5
ld IX, $0000                   ; 019D: DD 21 00 00
add IX, SP                     ; 01A1: DD 39
push AF                        ; 01A3: F5
push BC                        ; 01A4: C5
push DE                        ; 01A5: D5
push HL                        ; 01A6: E5
ld HL, $000A                   ; 01A7: 21 0A 00
push HL                        ; 01AA: E5
call fib                       ; 01AB: CD 00 00
inc SP                         ; 01AE: 33
inc SP                         ; 01AF: 33
__zax_epilogue_5:
pop HL                         ; 01B0: E1
pop DE                         ; 01B1: D1
pop BC                         ; 01B2: C1
pop AF                         ; 01B3: F1
ld SP, IX                      ; 01B4: DD F9
pop IX                         ; 01B6: DD E1
ret                            ; 01B8: C9
; func main end

; symbols:
; label fib = $0100
; label __zax_while_cond_1 = $011B
; label __zax_if_else_3 = $013D
; label __zax_while_end_2 = $018B
; label __zax_epilogue_0 = $0193
; label main = $019B
; label __zax_epilogue_5 = $01B0
