package net.mrchar.corn.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import net.mrchar.corn.model.base.AuditableEntity;

@Getter
@Setter
@Entity
@Table(name = "record")
public class Record extends AuditableEntity {
    @ManyToOne
    @JoinColumn(name = "quota_id")
    private Quota quota;

    @Column(name = "amount")
    private Double amount;
}
