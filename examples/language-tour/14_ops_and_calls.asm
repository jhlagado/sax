; ZAX lowered .asm trace
; range: $0100..$0140 (end exclusive)

; func add_to_sample begin
add_to_sample:
ld HL, (sample_word)           ; 0100: 2A 00 00
ld HL, $0002                   ; 0103: 21 02 00
add HL, SP                     ; 0106: 39
ld a, (hl) ; inc hl ; ld d, (hl) ; ld e, a ; 0107: 7E 23 56 5F
xor A                          ; 010B: AF
adc HL, DE                     ; 010C: ED 5A
ret                            ; 010E: C9
; func add_to_sample end
; func main begin
main:
push BC                        ; 010F: C5
ld HL, $0002                   ; 0110: 21 02 00
add HL, SP                     ; 0113: 39
ld (HL), $0000                 ; 0114: 36 00
inc HL                         ; 0116: 23
ld (HL), $0000                 ; 0117: 36 00
ld A, (sample_byte)            ; 0119: 3A 00 00
push AF                        ; 011C: F5
push BC                        ; 011D: C5
push DE                        ; 011E: D5
push IX                        ; 011F: DD E5
push IY                        ; 0121: FD E5
ld HL, $0017                   ; 0123: 21 17 00
push HL                        ; 0126: E5
call add_to_sample             ; 0127: CD 00 00
pop BC                         ; 012A: C1
pop IY                         ; 012B: FD E1
pop IX                         ; 012D: DD E1
pop DE                         ; 012F: D1
pop BC                         ; 0130: C1
pop AF                         ; 0131: F1
push HL                        ; 0132: E5
ld HL, $0002                   ; 0133: 21 02 00
add HL, SP                     ; 0136: 39
pop DE                         ; 0137: D1
ld (hl), e ; inc hl ; ld (hl), d ; 0138: 73 23 72
jp __zax_epilogue_1            ; 013B: C3 00 00
__zax_epilogue_1:
pop BC                         ; 013E: C1
ret                            ; 013F: C9
; func main end

; symbols:
; label add_to_sample = $0100
; label main = $010F
; label __zax_epilogue_1 = $013E
; var sample_byte = $0140
; var sample_word = $0141
